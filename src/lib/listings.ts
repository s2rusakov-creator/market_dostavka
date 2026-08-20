import "server-only";
import { prisma } from "./prisma";
import { displayName } from "./format";
import { FALLBACK_AVG_PRICE, type Sort } from "./constants";
import type { ListingCardData } from "@/components/ListingCard";
import type { Category } from "@/generated/prisma/enums";

const ORDER: Record<Sort, Record<string, "asc" | "desc">> = {
  newest: { createdAt: "desc" },
  cheapest: { priceRub: "asc" },
  expensive: { priceRub: "desc" },
  deadline: { deadlineTo: "asc" },
};

/**
 * Протухшие заявки гасим при чтении ленты — отдельный планировщик ради
 * одной операции разворачивать не стоит, а пустая лента из мёртвых заявок
 * убивает доверие быстрее всего.
 */
async function expireOverdue(): Promise<void> {
  await prisma.listing.updateMany({
    where: { status: "ACTIVE", deadlineTo: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

export async function getFeed(params: {
  category?: string | null;
  sort?: string | null;
  userId?: string | null;
}): Promise<ListingCardData[]> {
  await expireOverdue();

  const sort = (
    params.sort && params.sort in ORDER ? params.sort : "newest"
  ) as Sort;

  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      ...(params.category ? { category: params.category as Category } : {}),
    },
    orderBy: ORDER[sort],
    take: 100,
    include: {
      author: {
        select: {
          firstName: true,
          lastName: true,
          ratingSum: true,
          ratingCount: true,
          deliveriesCount: true,
        },
      },
      _count: { select: { responses: true } },
      threads: params.userId
        ? { where: { travelerId: params.userId }, select: { id: true } }
        : false,
    },
  });

  return listings.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    category: l.category,
    weightKg: l.weightKg ? l.weightKg.toString() : null,
    dimensions: l.dimensions,
    sizePreset: l.sizePreset,
    deadlineFrom: l.deadlineFrom ? l.deadlineFrom.toISOString() : null,
    deadlineTo: l.deadlineTo.toISOString(),
    pickupArea: l.pickupArea,
    priceRub: l.priceRub,
    photoUrl: l.photoUrl,
    urgent: l.urgent,
    fragile: l.fragile,
    needsLuggage: l.needsLuggage,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    responsesCount: l._count.responses,
    author: {
      name: displayName(l.author.firstName, l.author.lastName),
      firstName: l.author.firstName,
      lastName: l.author.lastName,
      ratingSum: l.author.ratingSum,
      ratingCount: l.author.ratingCount,
      deliveriesCount: l.author.deliveriesCount,
    },
    isOwn: params.userId === l.authorId,
    respondedThreadId:
      "threads" in l && Array.isArray(l.threads) && l.threads.length > 0
        ? l.threads[0].id
        : null,
  }));
}

export async function getStats(): Promise<{
  active: number;
  avgPrice: number;
  newToday: number;
}> {
  const dayAgo = new Date(Date.now() - 24 * 3600e3);

  const [active, avg, newToday] = await Promise.all([
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.aggregate({
      where: { status: "ACTIVE" },
      _avg: { priceRub: true },
    }),
    prisma.listing.count({ where: { createdAt: { gte: dayAgo } } }),
  ]);

  return {
    active,
    // Пока заявок нет, показываем ориентир из макета, а не ноль.
    avgPrice: Math.round(avg._avg.priceRub ?? FALLBACK_AVG_PRICE),
    newToday,
  };
}
