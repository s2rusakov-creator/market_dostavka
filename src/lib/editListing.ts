import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./api";
import { endOfDayUtc } from "./format";
import type { createListingSchema } from "./validation";
import type { z } from "zod";

/**
 * Правка уже опубликованной заявки.
 *
 * Раньше правки не было вовсе: ошиблись в цене или дате — снимай с публикации
 * и заводи заново, теряя вместе с заявкой все отклики и переписки. Для доски,
 * где цену часто уточняют после первых вопросов, это ломало весь смысл.
 *
 * Что можно менять: всё содержательное — категорию, название, описание, вес,
 * габариты, даты, район, цену, фотографию и метки.
 *
 * Чего менять нельзя: автора и статус. Статус живёт своей жизнью — его меняет
 * закрытие сделки, и путать эти две операции нельзя, иначе правкой запятой
 * можно было бы «отменить» доставку.
 *
 * Когда править нельзя: после того как сделка закрыта. У доставленной или
 * снятой заявки менять условия задним числом — значит переписывать то, о чём
 * люди уже договорились, и то, что видно в отзывах.
 */
export async function editListing(params: {
  listingId: string;
  actorId: string;
  data: z.infer<typeof createListingSchema>;
}): Promise<{ ok: true; id: string }> {
  const listing = await prisma.listing.findUnique({
    where: { id: params.listingId },
    select: { authorId: true, status: true },
  });

  if (!listing) throw new HttpError("NOT_FOUND", 404);
  if (listing.authorId !== params.actorId) throw new HttpError("FORBIDDEN", 403);
  if (listing.status === "DONE" || listing.status === "CANCELLED") {
    throw new HttpError("ALREADY_CLOSED", 409);
  }

  const { data } = params;
  const endOfDay = endOfDayUtc(data.deadlineTo);
  if (endOfDay.getTime() < Date.now()) {
    throw new HttpError("DEADLINE_PAST", 422);
  }

  await prisma.listing.update({
    where: { id: params.listingId },
    data: {
      category: data.category,
      title: data.title,
      description: data.description || null,
      weightKg: data.weightKg ?? null,
      sizePreset: data.sizePreset ?? null,
      dimensions: data.dimensions || null,
      deadlineFrom: data.deadlineFrom ?? null,
      deadlineTo: endOfDay,
      pickupArea: data.pickupArea || null,
      priceRub: data.priceRub,
      photoUrl: data.photoUrl || null,
      urgent: data.urgent ?? false,
      fragile: data.fragile ?? false,
      needsLuggage: data.needsLuggage ?? false,
      // Просроченная заявка после правки срока снова живая: иначе исправить
      // дату было бы невозможно — заявка так и осталась бы вне ленты.
      ...(listing.status === "EXPIRED" ? { status: "ACTIVE" as const } : {}),
    },
  });

  return { ok: true, id: params.listingId };
}
