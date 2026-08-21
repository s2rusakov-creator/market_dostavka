import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./api";

/**
 * Закрытие заявки отправителем.
 *
 * Отдельно от роута, потому что тут вся содержательная логика: кто имел право
 * закрыть, кому засчитать доставку и что делать, когда откликнувшихся было
 * несколько.
 *
 * Раньше счётчик доставок искал отклик со статусом ACCEPTED, но этот статус
 * нигде не проставлялся — в итоге «N доставок» на карточках не рос никогда,
 * хотя показывается как показатель надёжности. Теперь выбранный пассажир
 * отмечается в момент закрытия.
 */
export async function closeListing(params: {
  listingId: string;
  actorId: string;
  status: "DONE" | "CANCELLED";
  /** Кого отправитель выбрал. Обязателен, если откликнувшихся больше одного. */
  travelerId?: string;
}): Promise<{ ok: true; creditedTo: string | null }> {
  const listing = await prisma.listing.findUnique({
    where: { id: params.listingId },
    select: {
      authorId: true,
      status: true,
      responses: { select: { id: true, travelerId: true } },
    },
  });

  if (!listing) throw new HttpError("NOT_FOUND", 404);
  if (listing.authorId !== params.actorId) throw new HttpError("FORBIDDEN", 403);
  if (listing.status === "DONE" || listing.status === "CANCELLED") {
    throw new HttpError("ALREADY_CLOSED", 409);
  }

  if (params.status === "CANCELLED") {
    await prisma.listing.update({
      where: { id: params.listingId },
      data: { status: "CANCELLED" },
    });
    return { ok: true, creditedTo: null };
  }

  const responses = listing.responses;
  let chosen: { id: string; travelerId: string } | null = null;

  if (params.travelerId) {
    chosen = responses.find((r) => r.travelerId === params.travelerId) ?? null;
    // Засчитать доставку тому, кто не откликался, нельзя: иначе рейтинг
    // накручивается запросом в обход интерфейса.
    if (!chosen) throw new HttpError("NOT_A_RESPONDER", 400);
  } else if (responses.length === 1) {
    chosen = responses[0];
  } else if (responses.length > 1) {
    // Гадать нельзя — доставку засчитывают конкретному человеку.
    throw new HttpError("CHOOSE_TRAVELER", 400);
  }

  await prisma.$transaction([
    prisma.listing.update({
      where: { id: params.listingId },
      data: { status: "DONE" },
    }),
    ...(chosen
      ? [
          prisma.response.update({
            where: { id: chosen.id },
            data: { status: "ACCEPTED" },
          }),
          prisma.user.update({
            where: { id: chosen.travelerId },
            data: { deliveriesCount: { increment: 1 } },
          }),
        ]
      : []),
  ]);

  return { ok: true, creditedTo: chosen?.travelerId ?? null };
}
