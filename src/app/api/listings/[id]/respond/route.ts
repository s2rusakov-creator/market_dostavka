import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { respondSchema } from "@/lib/validation";
import { notifyNewResponse } from "@/lib/notify";
import { displayName } from "@/lib/format";
import { withdrawResponse } from "@/lib/responses";

/** Отклик путешественника: создаёт отклик, заводит личный чат и шлёт пуш автору. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = respondSchema.parse(await req.json().catch(() => ({})));

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true, title: true },
    });
    if (!listing) throw new HttpError("NOT_FOUND", 404);
    if (listing.authorId === user.id) throw new HttpError("OWN_LISTING", 400);
    if (listing.status !== "ACTIVE") throw new HttpError("NOT_ACTIVE", 409);

    const thread = await prisma.$transaction(async (tx) => {
      await tx.response.upsert({
        where: {
          listingId_travelerId: { listingId: id, travelerId: user.id },
        },
        create: { listingId: id, travelerId: user.id },
        update: {},
      });

      const thread = await tx.thread.upsert({
        where: {
          listingId_travelerId: { listingId: id, travelerId: user.id },
        },
        create: {
          listingId: id,
          senderId: listing.authorId,
          travelerId: user.id,
        },
        update: {},
        select: { id: true },
      });

      if (body.text) {
        await tx.message.create({
          data: { threadId: thread.id, authorId: user.id, text: body.text },
        });
        await tx.thread.update({
          where: { id: thread.id },
          data: { lastMessageAt: new Date() },
        });
      }

      return thread;
    });

    // Пуш автору — после ответа: путешественник не должен ждать Telegram,
    // чтобы попасть в только что созданный чат.
    after(async () => {
      await notifyNewResponse({
        recipientId: listing.authorId,
        travelerName: displayName(user.firstName, user.lastName),
        listingTitle: listing.title,
        threadId: thread.id,
      });
    });

    return { threadId: thread.id };
  });
}

/**
 * Отозвать свой отклик. Промах по кнопке не должен быть необратимым.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    return withdrawResponse({ listingId: id, travelerId: user.id });
  });
}
