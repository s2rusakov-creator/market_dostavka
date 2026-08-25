import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { FEED_MAX, FEED_PAGE, getFeed, getStats } from "@/lib/listings";

const DAY = 86400e3;

async function makeUser(name: string, telegramId: bigint) {
  return prisma.user.create({
    data: { firstName: name, telegramId },
  });
}

async function makeListing(
  authorId: string,
  over: Partial<{
    title: string;
    category: "DOCUMENTS" | "MEDICINE" | "ELECTRONICS" | "CLOTHES" | "OTHER";
    priceRub: number;
    deadlineTo: Date;
    status: "ACTIVE" | "DONE" | "CANCELLED" | "EXPIRED";
  }> = {}
) {
  return prisma.listing.create({
    data: {
      authorId,
      category: over.category ?? "DOCUMENTS",
      title: over.title ?? "Документы, папка А4",
      priceRub: over.priceRub ?? 3000,
      deadlineTo: over.deadlineTo ?? new Date(Date.now() + 4 * DAY),
      status: over.status ?? "ACTIVE",
    },
  });
}

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("getFeed", () => {
  it("показывает активные заявки", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id);

    const feed = (await getFeed({})).items;
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe("Документы, папка А4");
  });

  it("скрывает закрытые и отменённые", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { status: "DONE" });
    await makeListing(author.id, { status: "CANCELLED" });

    expect((await getFeed({})).items).toHaveLength(0);
  });

  it("скрывает просроченные, даже если статус ещё ACTIVE", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { deadlineTo: new Date(Date.now() - DAY) });

    expect((await getFeed({})).items).toHaveLength(0);
  });

  it("фильтрует по категории", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { category: "DOCUMENTS" });
    await makeListing(author.id, { category: "MEDICINE", title: "Лекарства" });

    const meds = (await getFeed({ category: "MEDICINE" })).items;
    expect(meds).toHaveLength(1);
    expect(meds[0].title).toBe("Лекарства");
  });

  it("сортирует по цене", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { priceRub: 9000, title: "Дорогая" });
    await makeListing(author.id, { priceRub: 3000, title: "Дешёвая" });

    expect((await getFeed({ sort: "cheapest" })).items[0].title).toBe("Дешёвая");
    expect((await getFeed({ sort: "expensive" })).items[0].title).toBe("Дорогая");
  });

  it("неизвестная сортировка не роняет ленту", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id);

    expect((await getFeed({ sort: "; drop table" })).items).toHaveLength(1);
  });

  it("помечает собственные заявки", async () => {
    const author = await makeUser("Марина", 1n);
    const other = await makeUser("Рустам", 2n);
    await makeListing(author.id);

    expect((await getFeed({ userId: author.id })).items[0].isOwn).toBe(true);
    expect((await getFeed({ userId: other.id })).items[0].isOwn).toBe(false);
    expect((await getFeed({})).items[0].isOwn).toBe(false);
  });

  it("подставляет чат тому, кто уже откликнулся", async () => {
    const author = await makeUser("Марина", 1n);
    const traveler = await makeUser("Рустам", 2n);
    const stranger = await makeUser("Лейла", 3n);
    const listing = await makeListing(author.id);

    await prisma.response.create({
      data: { listingId: listing.id, travelerId: traveler.id },
    });
    const thread = await prisma.thread.create({
      data: {
        listingId: listing.id,
        senderId: author.id,
        travelerId: traveler.id,
      },
    });

    const дляНего = (await getFeed({ userId: traveler.id })).items[0];
    expect(дляНего.hasResponded).toBe(true);
    expect(дляНего.respondedThreadId).toBe(thread.id);

    const дляПостороннего = (await getFeed({ userId: stranger.id })).items[0];
    expect(дляПостороннего.hasResponded).toBe(false);
    expect(дляПостороннего.respondedThreadId).toBeNull();
  });

  it("отозвавший отклик снова видит кнопку, даже если переписка осталась", async () => {
    const author = await makeUser("Марина", 1n);
    const traveler = await makeUser("Рустам", 2n);
    const listing = await makeListing(author.id);

    await prisma.response.create({
      data: { listingId: listing.id, travelerId: traveler.id },
    });
    await prisma.thread.create({
      data: {
        listingId: listing.id,
        senderId: author.id,
        travelerId: traveler.id,
      },
    });

    // Отзыв отклика: переписку с сообщениями мы сохраняем, она принадлежит
    // обоим. Но карточка не должна продолжать утверждать «вы откликнулись».
    await prisma.response.deleteMany({ where: { travelerId: traveler.id } });

    const карточка = (await getFeed({ userId: traveler.id })).items[0];
    expect(карточка.hasResponded).toBe(false);
    expect(карточка.respondedThreadId).toBeNull();
  });

  it("откликнувшемуся без переписки кнопка не ведёт в никуда", async () => {
    const author = await makeUser("Марина", 1n);
    const traveler = await makeUser("Рустам", 2n);
    const listing = await makeListing(author.id);

    await prisma.response.create({
      data: { listingId: listing.id, travelerId: traveler.id },
    });

    const карточка = (await getFeed({ userId: traveler.id })).items[0];
    expect(карточка.hasResponded).toBe(true);
    expect(карточка.respondedThreadId).toBeNull();
  });

  it("вес отдаётся строкой, чтобы не терять точность Decimal", async () => {
    const author = await makeUser("Марина", 1n);
    await prisma.listing.create({
      data: {
        authorId: author.id,
        category: "DOCUMENTS",
        title: "С весом",
        priceRub: 3000,
        weightKg: 2.5,
        deadlineTo: new Date(Date.now() + DAY),
      },
    });

    const feed = (await getFeed({})).items;
    expect(typeof feed[0].weightKg).toBe("string");
    expect(feed[0].weightKg).toBe("2.5");
  });
});

describe("getStats", () => {
  it("считает активные, среднюю цену и новые за сутки", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { priceRub: 3000 });
    await makeListing(author.id, { priceRub: 9000 });

    const stats = await getStats();
    expect(stats.active).toBe(2);
    expect(stats.avgPrice).toBe(6000);
    expect(stats.newToday).toBe(2);
  });

  it("просроченные в статистику не попадают", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { priceRub: 3000 });
    await makeListing(author.id, {
      priceRub: 100000,
      deadlineTo: new Date(Date.now() - DAY),
    });

    const stats = await getStats();
    expect(stats.active).toBe(1);
    expect(stats.avgPrice).toBe(3000);
  });

  it("на пустой базе показывает ориентир, а не ноль", async () => {
    const stats = await getStats();
    expect(stats.active).toBe(0);
    expect(stats.avgPrice).toBeGreaterThan(0);
  });
});

describe("подгрузка ленты", () => {
  /** Заявок больше, чем помещается на одну страницу. */
  async function многоЗаявок(count: number) {
    const author = await makeUser("Марина", 1n);
    for (let i = 0; i < count; i++) {
      await makeListing(author.id, {
        title: `Заявка ${String(i).padStart(2, "0")}`,
        priceRub: 1000 + i,
      });
    }
    return author;
  }

  it("по умолчанию отдаёт одну страницу и говорит, что есть ещё", async () => {
    await многоЗаявок(FEED_PAGE + 5);

    const feed = await getFeed({});
    expect(feed.items).toHaveLength(FEED_PAGE);
    expect(feed.hasMore).toBe(true);
    expect(feed.shown).toBe(FEED_PAGE);
  });

  it("на последней странице больше ничего не обещает", async () => {
    await многоЗаявок(FEED_PAGE + 5);

    const feed = await getFeed({ limit: FEED_PAGE + 5 });
    expect(feed.items).toHaveLength(FEED_PAGE + 5);
    expect(feed.hasMore).toBe(false);
  });

  it("ровно страница — продолжения нет", async () => {
    await многоЗаявок(FEED_PAGE);

    const feed = await getFeed({});
    expect(feed.items).toHaveLength(FEED_PAGE);
    expect(feed.hasMore).toBe(false);
  });

  it("следующий шаг показывает то, что не влезло", async () => {
    await многоЗаявок(FEED_PAGE + 3);

    const первая = await getFeed({ sort: "cheapest" });
    const вторая = await getFeed({ sort: "cheapest", limit: FEED_PAGE * 2 });

    // Первая страница целиком входит во вторую, и порядок не сбивается.
    expect(вторая.items.slice(0, FEED_PAGE).map((l) => l.id)).toEqual(
      первая.items.map((l) => l.id)
    );
    expect(вторая.items).toHaveLength(FEED_PAGE + 3);
  });

  it("предел нельзя раздуть до выгрузки всей базы", async () => {
    await многоЗаявок(3);

    const feed = await getFeed({ limit: 100000 });
    // Больше FEED_MAX не отдаём, сколько ни проси.
    expect(feed.items.length).toBeLessThanOrEqual(FEED_MAX);
  });

  it("мусор вместо предела не роняет ленту", async () => {
    await многоЗаявок(3);

    expect((await getFeed({ limit: Number.NaN })).items).toHaveLength(3);
    expect((await getFeed({ limit: -5 })).items).toHaveLength(3);
    expect((await getFeed({ limit: null })).items).toHaveLength(3);
  });
});
