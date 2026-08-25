import "server-only";
import { prisma } from "./prisma";
import { displayName } from "./format";
import { FALLBACK_AVG_PRICE, type Sort } from "./constants";
import { formatRating, platformMeanFrom } from "./rating";
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

/** Сколько заявок показываем сразу и сколько добавляет «показать ещё». */
export const FEED_PAGE = 20;

/**
 * Предел на одну страницу. Лента раньше жёстко обрывалась на сотне: сто первая
 * заявка не существовала ни для кого, а при сортировке «сначала дешёвые» так
 * пропадало всё, кроме сотни самых дешёвых. Теперь предел двигает сам человек,
 * но не бесконечно — иначе одним адресом можно попросить выгрузить всю базу.
 */
export const FEED_MAX = 200;

export type Feed = {
  items: ListingCardData[];
  /** Есть ли что показать дальше. */
  hasMore: boolean;
  /** Сколько показано сейчас — с этого считается следующий шаг. */
  shown: number;
};

export async function getFeed(params: {
  category?: string | null;
  sort?: string | null;
  userId?: string | null;
  /** Сколько заявок показать. По умолчанию одна страница. */
  limit?: number | null;
}): Promise<Feed> {
  await expireOverdue();

  const sort = (
    params.sort && params.sort in ORDER ? params.sort : "newest"
  ) as Sort;

  const limit = Math.min(
    Math.max(Number(params.limit) || FEED_PAGE, FEED_PAGE),
    FEED_MAX
  );

  // Берём на одну больше запрошенного: если лишняя пришла — значит впереди
  // есть ещё, и отдельный count-запрос ради этого не нужен.
  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      // Фильтр по сроку здесь, а не только в expireOverdue: тогда просроченная
      // заявка исчезает из ленты сразу, не дожидаясь фоновой чистки.
      deadlineTo: { gte: new Date() },
      ...(params.category ? { category: params.category as Category } : {}),
    },
    orderBy: ORDER[sort],
    take: limit + 1,
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
      /**
       * Откликался ли этот человек — вопрос к откликам, а не к перепискам.
       *
       * Раньше состояние кнопки выводилось из существования чата, и это
       * совпадало с истиной только потому, что отклик был необратим. Теперь
       * отклик можно отозвать, а переписка при этом остаётся, если в ней
       * успели поговорить, — и карточка продолжала бы утверждать «вы
       * откликнулись» у человека, который отклик снял.
       */
      responses: params.userId
        ? { where: { travelerId: params.userId }, select: { id: true } }
        : false,
      threads: params.userId
        ? { where: { travelerId: params.userId }, select: { id: true } }
        : false,
    },
  });

  const hasMore = listings.length > limit;
  const page = hasMore ? listings.slice(0, limit) : listings;

  // Средняя по площадке нужна, чтобы сжать к ней оценки тех, у кого отзывов
  // мало. Один лёгкий агрегат на показ ленты, а не запрос на каждую карточку.
  const platformMean = await platformRatingMean();

  const items = page.map((l) => ({
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
      id: l.authorId,
      name: displayName(l.author.firstName, l.author.lastName),
      firstName: l.author.firstName,
      lastName: l.author.lastName,
      // Готовая строка, а не сырые счётчики: правило показа одно на весь
      // сайт, и повторять его в каждом месте отрисовки не нужно.
      rating: formatRating(
        l.author.ratingSum,
        l.author.ratingCount,
        platformMean
      ),
      ratingCount: l.author.ratingCount,
      deliveriesCount: l.author.deliveriesCount,
      sentCount: l.author.sentCount,
    },
    isOwn: params.userId === l.authorId,
    // Отклик есть — показываем «вы откликнулись» и ведём в переписку, если
    // она заведена. Отклика нет — кнопка снова предлагает откликнуться,
    // даже если переписка с прошлого раза сохранилась.
    respondedThreadId:
      "responses" in l && Array.isArray(l.responses) && l.responses.length > 0
        ? "threads" in l && Array.isArray(l.threads) && l.threads.length > 0
          ? l.threads[0].id
          : null
        : null,
    /** Откликался ли, независимо от того, есть ли переписка. */
    hasResponded:
      "responses" in l && Array.isArray(l.responses) && l.responses.length > 0,
  }));

  return { items, hasMore, shown: items.length };
}

/**
 * Средняя оценка по всей площадке.
 *
 * Считается из готовых сумм на пользователях, поэтому это один лёгкий агрегат,
 * а не проход по таблице отзывов. Нужна, чтобы сжимать к ней оценки тех, у
 * кого отзывов ещё мало, — см. lib/rating.ts.
 */
export async function platformRatingMean(): Promise<number> {
  const totals = await prisma.user.aggregate({
    _sum: { ratingSum: true, ratingCount: true },
  });

  return platformMeanFrom(
    totals._sum.ratingSum ?? 0,
    totals._sum.ratingCount ?? 0
  );
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
