import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getFeed, getStats } from "@/lib/listings";

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

    const feed = await getFeed({});
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe("Документы, папка А4");
  });

  it("скрывает закрытые и отменённые", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { status: "DONE" });
    await makeListing(author.id, { status: "CANCELLED" });

    expect(await getFeed({})).toHaveLength(0);
  });

  it("скрывает просроченные, даже если статус ещё ACTIVE", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { deadlineTo: new Date(Date.now() - DAY) });

    expect(await getFeed({})).toHaveLength(0);
  });

  it("фильтрует по категории", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { category: "DOCUMENTS" });
    await makeListing(author.id, { category: "MEDICINE", title: "Лекарства" });

    const meds = await getFeed({ category: "MEDICINE" });
    expect(meds).toHaveLength(1);
    expect(meds[0].title).toBe("Лекарства");
  });

  it("сортирует по цене", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id, { priceRub: 9000, title: "Дорогая" });
    await makeListing(author.id, { priceRub: 3000, title: "Дешёвая" });

    expect((await getFeed({ sort: "cheapest" }))[0].title).toBe("Дешёвая");
    expect((await getFeed({ sort: "expensive" }))[0].title).toBe("Дорогая");
  });

  it("неизвестная сортировка не роняет ленту", async () => {
    const author = await makeUser("Марина", 1n);
    await makeListing(author.id);

    expect(await getFeed({ sort: "; drop table" })).toHaveLength(1);
  });

  it("помечает собственные заявки", async () => {
    const author = await makeUser("Марина", 1n);
    const other = await makeUser("Рустам", 2n);
    await makeListing(author.id);

    expect((await getFeed({ userId: author.id }))[0].isOwn).toBe(true);
    expect((await getFeed({ userId: other.id }))[0].isOwn).toBe(false);
    expect((await getFeed({}))[0].isOwn).toBe(false);
  });

  it("подставляет чат тому, кто уже откликнулся", async () => {
    const author = await makeUser("Марина", 1n);
    const traveler = await makeUser("Рустам", 2n);
    const stranger = await makeUser("Лейла", 3n);
    const listing = await makeListing(author.id);

    const thread = await prisma.thread.create({
      data: {
        listingId: listing.id,
        senderId: author.id,
        travelerId: traveler.id,
      },
    });

    expect((await getFeed({ userId: traveler.id }))[0].respondedThreadId).toBe(
      thread.id
    );
    expect(
      (await getFeed({ userId: stranger.id }))[0].respondedThreadId
    ).toBeNull();
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

    const feed = await getFeed({});
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
