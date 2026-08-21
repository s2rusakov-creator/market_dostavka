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
 * Протухшие заявки гасим при чтении ленты — отдельный планировщик ради одной
 * операции разворачивать не стоит.
 *
 * Но выполнять запись на каждый показ ленты незачем: сама лента отфильтрована
 * по сроку и без этого, а лишний round-trip до базы стоит дорого — функции и
 * база могут стоять в разных регионах. Поэтому чистим не чаще раза в 5 минут
 * на экземпляр функции.
 */
const EXPIRE_INTERVAL_MS = 5 * 60 * 1000;
let lastExpireRun = 0;

async function expireOverdue(): Promise<void> {
  const now = Date.now();
  if (now - lastExpireRun < EXPIRE_INTERVAL_MS) return;
  lastExpireRun = now;

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
      // Фильтр по сроку здесь, а не только в expireOverdue: тогда просроченная
      // заявка исчезает из ленты сразу, не дожидаясь фоновой чистки.
      deadlineTo: { gte: new Date() },
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
          sentCount: true,
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
      sentCount: l.author.sentCount,
    },
    isOwn: params.userId === l.authorId,
    respondedThreadId:
      "threads" in l && Array.isArray(l.threads) && l.threads.length > 0
        ? l.threads[0].id
        : null,
  }));
}

/**
 * Три показателя одним запросом.
 *
 * Раньше это были три отдельных обращения к базе. Между регионами каждый
 * round-trip стоит около сотни миллисекунд, и на них уходило больше времени,
 * чем на саму работу — а Postgres считает всё это за один проход по таблице.
 */
export async function getStats(): Promise<{
  active: number;
  avgPrice: number;
  newToday: number;
}> {
  const rows = await prisma.$queryRaw<
    { active: number; avg: number | null; newToday: number }[]
  >`
    SELECT
      count(*) FILTER (
        WHERE "status" = 'ACTIVE' AND "deadlineTo" >= now()
      )::int AS active,
      avg("priceRub") FILTER (
        WHERE "status" = 'ACTIVE' AND "deadlineTo" >= now()
      )::float8 AS avg,
      count(*) FILTER (
        WHERE "createdAt" >= now() - interval '24 hours'
      )::int AS "newToday"
    FROM "Listing"
  `;

  const row = rows[0];

  return {
    active: row?.active ?? 0,
    // Пока заявок нет, показываем ориентир из макета, а не ноль.
    avgPrice: Math.round(row?.avg ?? FALLBACK_AVG_PRICE),
    newToday: row?.newToday ?? 0,
  };
}
