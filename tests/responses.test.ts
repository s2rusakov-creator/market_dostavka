import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { withdrawResponse } from "@/lib/responses";
import { closeListing } from "@/lib/closeListing";

const DAY = 86400e3;

/** Отправитель, путешественник, заявка, отклик и пустая переписка к ней. */
async function scene() {
  const sender = await prisma.user.create({
    data: { firstName: "Марина", telegramId: 1n },
  });
  const traveler = await prisma.user.create({
    data: { firstName: "Рустам", telegramId: 2n },
  });
  const listing = await prisma.listing.create({
    data: {
      authorId: sender.id,
      category: "DOCUMENTS",
      title: "Документы, папка А4",
      priceRub: 3000,
      deadlineTo: new Date(Date.now() + DAY),
    },
  });
  await prisma.response.create({
    data: { listingId: listing.id, travelerId: traveler.id },
  });
  const thread = await prisma.thread.create({
    data: {
      listingId: listing.id,
      senderId: sender.id,
      travelerId: traveler.id,
    },
  });

  return { sender, traveler, listing, thread };
}

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("отзыв отклика", () => {
  it("промах по кнопке отменяется вместе с пустой перепиской", async () => {
    const { traveler, listing, thread } = await scene();

    const итог = await withdrawResponse({
      listingId: listing.id,
      travelerId: traveler.id,
    });

    expect(итог.threadRemoved).toBe(true);
    expect(await prisma.response.count()).toBe(0);
    expect(await prisma.thread.findUnique({ where: { id: thread.id } })).toBeNull();
  });

  it("после отзыва можно откликнуться заново", async () => {
    const { traveler, listing } = await scene();

    await withdrawResponse({ listingId: listing.id, travelerId: traveler.id });

    // Уникальный индекс освободился — раньше он держал отклик навсегда.
    await expect(
      prisma.response.create({
        data: { listingId: listing.id, travelerId: traveler.id },
      })
    ).resolves.toMatchObject({ travelerId: traveler.id });
  });

  it("переписку с сообщениями не стираем — она принадлежит обоим", async () => {
    const { sender, traveler, listing, thread } = await scene();
    await prisma.message.create({
      data: { threadId: thread.id, authorId: sender.id, text: "Здравствуйте" },
    });

    const итог = await withdrawResponse({
      listingId: listing.id,
      travelerId: traveler.id,
    });

    expect(итог.threadRemoved).toBe(false);
    expect(await prisma.response.count()).toBe(0);
    // История разговора осталась у обеих сторон.
    expect(
      await prisma.thread.findUnique({ where: { id: thread.id } })
    ).not.toBeNull();
    expect(await prisma.message.count()).toBe(1);
  });

  it("состоявшуюся сделку отозвать нельзя", async () => {
    const { sender, traveler, listing } = await scene();
    await closeListing({
      listingId: listing.id,
      actorId: sender.id,
      status: "DONE",
    });

    // Доставка уже засчитана: переписывать это задним числом — подделка
    // счётчиков и рейтинга.
    await expect(
      withdrawResponse({ listingId: listing.id, travelerId: traveler.id })
    ).rejects.toMatchObject({ code: "ALREADY_ACCEPTED" });

    expect(await prisma.response.count()).toBe(1);
  });

  it("нельзя отозвать то, чего не было", async () => {
    const { listing } = await scene();
    const посторонний = await prisma.user.create({
      data: { firstName: "Посторонний", telegramId: 99n },
    });

    await expect(
      withdrawResponse({ listingId: listing.id, travelerId: посторонний.id })
    ).rejects.toMatchObject({ code: "NOT_RESPONDED" });
  });

  it("чужой отклик не трогается", async () => {
    const { traveler, listing } = await scene();
    const второй = await prisma.user.create({
      data: { firstName: "Второй", telegramId: 3n },
    });
    await prisma.response.create({
      data: { listingId: listing.id, travelerId: второй.id },
    });

    await withdrawResponse({ listingId: listing.id, travelerId: traveler.id });

    const оставшиеся = await prisma.response.findMany();
    expect(оставшиеся).toHaveLength(1);
    expect(оставшиеся[0].travelerId).toBe(второй.id);
  });

  it("счётчик откликов на заявке уменьшается", async () => {
    const { traveler, listing } = await scene();
    const до = await prisma.response.count({ where: { listingId: listing.id } });

    await withdrawResponse({ listingId: listing.id, travelerId: traveler.id });

    const после = await prisma.response.count({
      where: { listingId: listing.id },
    });
    expect(до).toBe(1);
    expect(после).toBe(0);
  });
});
