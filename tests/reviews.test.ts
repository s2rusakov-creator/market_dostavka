import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { closeListing } from "@/lib/closeListing";
import { leaveReview, reviewTarget } from "@/lib/reviews";

const DAY = 86400e3;

/** Сделка: заявка отправителя, отклик путешественника, при need — закрытая. */
async function deal({ close = true }: { close?: boolean } = {}) {
  const sender = await prisma.user.create({
    data: { firstName: "Марина", lastName: "Кулиева", telegramId: 1n },
  });
  const traveler = await prisma.user.create({
    data: { firstName: "Рустам", lastName: "Алиев", telegramId: 2n },
  });
  const stranger = await prisma.user.create({
    data: { firstName: "Лейла", telegramId: 3n },
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

  if (close) {
    await closeListing({
      listingId: listing.id,
      actorId: sender.id,
      status: "DONE",
    });
  }

  return { sender, traveler, stranger, listing };
}

const userById = (id: string) =>
  prisma.user.findUniqueOrThrow({ where: { id } });

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("кого можно оценить", () => {
  it("отправитель оценивает того, кто вёз", async () => {
    const { sender, traveler, listing } = await deal();

    const target = await reviewTarget(listing.id, sender.id);
    expect(target).toMatchObject({ targetId: traveler.id, role: "sender" });
  });

  it("путешественник оценивает отправителя", async () => {
    const { sender, traveler, listing } = await deal();

    const target = await reviewTarget(listing.id, traveler.id);
    expect(target).toMatchObject({ targetId: sender.id, role: "traveler" });
  });

  it("посторонний оценить не может", async () => {
    const { stranger, listing } = await deal();
    expect(await reviewTarget(listing.id, stranger.id)).toBeNull();
  });

  it("по незакрытой сделке оценивать нечего", async () => {
    const { sender, listing } = await deal({ close: false });
    expect(await reviewTarget(listing.id, sender.id)).toBeNull();
  });

  it("если пассажира так и не выбрали, отзыва нет", async () => {
    const sender = await prisma.user.create({
      data: { firstName: "Марина", telegramId: 10n },
    });
    const listing = await prisma.listing.create({
      data: {
        authorId: sender.id,
        category: "DOCUMENTS",
        title: "Без откликов",
        priceRub: 3000,
        deadlineTo: new Date(Date.now() + DAY),
      },
    });
    await closeListing({
      listingId: listing.id,
      actorId: sender.id,
      status: "DONE",
    });

    expect(await reviewTarget(listing.id, sender.id)).toBeNull();
  });

  it("после отзыва повторно оценивать нечего", async () => {
    const { sender, listing } = await deal();
    await leaveReview({ listingId: listing.id, authorId: sender.id, rating: 5 });

    expect(await reviewTarget(listing.id, sender.id)).toBeNull();
  });
});

describe("оставить отзыв", () => {
  it("оценка попадает в рейтинг получателя", async () => {
    const { sender, traveler, listing } = await deal();

    await leaveReview({
      listingId: listing.id,
      authorId: sender.id,
      rating: 5,
      text: "Всё вовремя",
    });

    const after = await userById(traveler.id);
    expect(after.ratingSum).toBe(5);
    expect(after.ratingCount).toBe(1);

    // Оценивающему в рейтинг ничего не прибавляется.
    expect((await userById(sender.id)).ratingCount).toBe(0);
  });

  it("обе стороны оценивают друг друга независимо", async () => {
    const { sender, traveler, listing } = await deal();

    await leaveReview({ listingId: listing.id, authorId: sender.id, rating: 5 });
    await leaveReview({
      listingId: listing.id,
      authorId: traveler.id,
      rating: 4,
    });

    expect((await userById(traveler.id)).ratingSum).toBe(5);
    expect((await userById(sender.id)).ratingSum).toBe(4);
    expect(await prisma.review.count()).toBe(2);
  });

  it("дважды по одной сделке оценить нельзя", async () => {
    const { sender, traveler, listing } = await deal();

    await leaveReview({ listingId: listing.id, authorId: sender.id, rating: 5 });
    await expect(
      leaveReview({ listingId: listing.id, authorId: sender.id, rating: 1 })
    ).rejects.toMatchObject({ code: "CANNOT_REVIEW" });

    // Первая оценка не удвоилась и не изменилась.
    const after = await userById(traveler.id);
    expect(after.ratingSum).toBe(5);
    expect(after.ratingCount).toBe(1);
  });

  it("посторонний накрутить рейтинг не может", async () => {
    const { stranger, traveler, listing } = await deal();

    await expect(
      leaveReview({ listingId: listing.id, authorId: stranger.id, rating: 5 })
    ).rejects.toMatchObject({ code: "CANNOT_REVIEW" });

    expect((await userById(traveler.id)).ratingCount).toBe(0);
  });

  it("оценка вне шкалы отвергается", async () => {
    const { sender, listing } = await deal();

    for (const rating of [0, 6, -1, 2.5, Number.NaN]) {
      await expect(
        leaveReview({ listingId: listing.id, authorId: sender.id, rating })
      ).rejects.toMatchObject({ code: "BAD_RATING" });
    }
    expect(await prisma.review.count()).toBe(0);
  });

  it("пустой комментарий не сохраняется строкой из пробелов", async () => {
    const { sender, listing } = await deal();

    await leaveReview({
      listingId: listing.id,
      authorId: sender.id,
      rating: 5,
      text: "   ",
    });

    const review = await prisma.review.findFirstOrThrow();
    expect(review.text).toBeNull();
  });

  it("слишком длинный комментарий обрезается", async () => {
    const { sender, listing } = await deal();

    await leaveReview({
      listingId: listing.id,
      authorId: sender.id,
      rating: 5,
      text: "я".repeat(5000),
    });

    const review = await prisma.review.findFirstOrThrow();
    expect(review.text).toHaveLength(1000);
  });
});

describe("счётчики ролей", () => {
  it("доставка засчитывается везущему, отправление — отправителю", async () => {
    const { sender, traveler } = await deal();

    const s = await userById(sender.id);
    const t = await userById(traveler.id);

    expect(t.deliveriesCount).toBe(1);
    expect(t.sentCount).toBe(0);
    expect(s.sentCount).toBe(1);
    expect(s.deliveriesCount).toBe(0);
  });
});

describe("ожидают оценки", () => {
  it("сделка попадает обеим сторонам, пока они не высказались", async () => {
    const { sender, traveler, listing } = await deal();

    const { pendingReviews } = await import("@/lib/reviews");

    const forSender = await pendingReviews(sender.id);
    expect(forSender).toHaveLength(1);
    expect(forSender[0]).toMatchObject({
      listingId: listing.id,
      targetName: "Рустам",
    });

    const forTraveler = await pendingReviews(traveler.id);
    expect(forTraveler[0].targetName).toBe("Марина");
  });

  it("после отзыва сделка уходит из списка только у автора отзыва", async () => {
    const { sender, traveler, listing } = await deal();
    const { pendingReviews } = await import("@/lib/reviews");

    await leaveReview({ listingId: listing.id, authorId: sender.id, rating: 5 });

    expect(await pendingReviews(sender.id)).toHaveLength(0);
    expect(await pendingReviews(traveler.id)).toHaveLength(1);
  });

  it("незакрытые сделки и чужие не попадают", async () => {
    const { sender, stranger } = await deal({ close: false });
    const { pendingReviews } = await import("@/lib/reviews");

    expect(await pendingReviews(sender.id)).toHaveLength(0);
    expect(await pendingReviews(stranger.id)).toHaveLength(0);
  });
});
