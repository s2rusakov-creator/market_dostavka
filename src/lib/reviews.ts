import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./api";

/**
 * Отзывы по завершённым сделкам.
 *
 * Оценивают друг друга обе стороны: отправитель — того, кто вёз, путешественник
 * — того, чью посылку вёз. Оценка попадает в ratingSum/ratingCount получателя,
 * оттуда её берут карточки в ленте.
 *
 * Оставить отзыв можно только по закрытой заявке и только участнику сделки:
 * иначе рейтинг накручивается запросами в обход интерфейса.
 */

export type ReviewTarget = {
  /** Кого предстоит оценить. */
  targetId: string;
  targetName: string;
  /** В какой роли выступал сам оценивающий. */
  role: "sender" | "traveler";
};

async function loadDeal(listingId: string) {
  return prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      status: true,
      authorId: true,
      author: { select: { id: true, firstName: true, lastName: true } },
      responses: {
        where: { status: "ACCEPTED" },
        select: {
          traveler: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      reviews: { select: { authorId: true } },
    },
  });
}

/**
 * Кого этот человек может оценить по этой заявке.
 * null — оценивать некого: сделка не закрыта, человек к ней непричастен,
 * пассажира так и не выбрали или отзыв уже оставлен.
 */
export async function reviewTarget(
  listingId: string,
  userId: string
): Promise<ReviewTarget | null> {
  const deal = await loadDeal(listingId);
  if (!deal || deal.status !== "DONE") return null;

  const traveler = deal.responses[0]?.traveler;
  // Без выбранного пассажира сделки как таковой не было — оценивать нечего.
  if (!traveler) return null;

  if (deal.reviews.some((r) => r.authorId === userId)) return null;

  if (userId === deal.authorId) {
    return {
      targetId: traveler.id,
      targetName: traveler.firstName,
      role: "sender",
    };
  }

  if (userId === traveler.id) {
    return {
      targetId: deal.author.id,
      targetName: deal.author.firstName,
      role: "traveler",
    };
  }

  return null;
}

export async function leaveReview(params: {
  listingId: string;
  authorId: string;
  rating: number;
  text?: string;
}): Promise<{ ok: true; targetId: string }> {
  if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
    throw new HttpError("BAD_RATING", 422);
  }

  const target = await reviewTarget(params.listingId, params.authorId);
  if (!target) throw new HttpError("CANNOT_REVIEW", 403);

  const text = params.text?.trim();

  await prisma.$transaction([
    prisma.review.create({
      data: {
        listingId: params.listingId,
        authorId: params.authorId,
        targetId: target.targetId,
        rating: params.rating,
        text: text ? text.slice(0, 1000) : null,
      },
    }),
    // Средняя оценка хранится готовой суммой: карточки в ленте показывают её
    // на каждой заявке, и считать среднее запросом на каждый показ дорого.
    prisma.user.update({
      where: { id: target.targetId },
      data: {
        ratingSum: { increment: params.rating },
        ratingCount: { increment: 1 },
      },
    }),
  ]);

  return { ok: true, targetId: target.targetId };
}

export type PendingReview = {
  listingId: string;
  listingTitle: string;
  targetName: string;
};

/**
 * Сделки, по которым человек ещё не высказался — в любой из двух ролей.
 *
 * Одним запросом, а не проверкой каждой заявки по очереди: страница «Мои
 * заявки» и без того делает несколько обращений к базе.
 */
export async function pendingReviews(
  userId: string,
  limit = 20
): Promise<PendingReview[]> {
  const listings = await prisma.listing.findMany({
    where: {
      status: "DONE",
      OR: [
        { authorId: userId },
        { responses: { some: { travelerId: userId, status: "ACCEPTED" } } },
      ],
      reviews: { none: { authorId: userId } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      authorId: true,
      author: { select: { firstName: true } },
      responses: {
        where: { status: "ACCEPTED" },
        select: { traveler: { select: { id: true, firstName: true } } },
      },
    },
  });

  return listings.flatMap((l) => {
    const traveler = l.responses[0]?.traveler;
    if (!traveler) return [];

    const targetName =
      l.authorId === userId ? traveler.firstName : l.author.firstName;

    return [{ listingId: l.id, listingTitle: l.title, targetName }];
  });
}
