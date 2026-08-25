import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./api";

/**
 * Отзыв отклика путешественником.
 *
 * Раньше отклик был необратим: ни кнопки, ни ручки в API, а уникальный индекс
 * не давал откликнуться заново. Один промах по кнопке — и постороннему
 * человеку ушло уведомление, счётчик откликов вырос, в чатах появилась
 * переписка, а убрать это мог только администратор запросом в базу.
 *
 * Что происходит при отзыве:
 *
 *   - Отклик удаляется. Уникальный индекс освобождается, и передумать можно
 *     в обе стороны — откликнуться снова тоже.
 *   - Переписка удаляется только если в ней нет ни одного сообщения. Пустая
 *     остаётся ровно от промаха, её и надо убрать. А если люди успели
 *     поговорить, история принадлежит обоим, и стирать её из-за решения
 *     одной стороны нельзя.
 *
 * Когда отозвать нельзя: если отправитель уже выбрал этого человека и
 * засчитал доставку. К тому моменту сделка состоялась, и переписывать её
 * задним числом — это подделка счётчиков и рейтинга.
 */
export async function withdrawResponse(params: {
  listingId: string;
  travelerId: string;
}): Promise<{ ok: true; threadRemoved: boolean }> {
  const response = await prisma.response.findUnique({
    where: {
      listingId_travelerId: {
        listingId: params.listingId,
        travelerId: params.travelerId,
      },
    },
    select: { id: true, status: true },
  });

  if (!response) throw new HttpError("NOT_RESPONDED", 404);
  if (response.status === "ACCEPTED") {
    throw new HttpError("ALREADY_ACCEPTED", 409);
  }

  const thread = await prisma.thread.findUnique({
    where: {
      listingId_travelerId: {
        listingId: params.listingId,
        travelerId: params.travelerId,
      },
    },
    select: { id: true, _count: { select: { messages: true } } },
  });

  const пустаяПереписка = thread !== null && thread._count.messages === 0;

  await prisma.$transaction([
    prisma.response.delete({ where: { id: response.id } }),
    ...(пустаяПереписка
      ? [prisma.thread.delete({ where: { id: thread.id } })]
      : []),
  ]);

  return { ok: true, threadRemoved: пустаяПереписка };
}
