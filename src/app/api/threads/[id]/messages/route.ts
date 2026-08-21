import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { messageSchema } from "@/lib/validation";
import { notifyNewMessage } from "@/lib/notify";
import { displayName } from "@/lib/format";

async function loadThread(threadId: string, userId: string) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      senderId: true,
      travelerId: true,
      listing: { select: { title: true } },
    },
  });
  if (!thread) throw new HttpError("NOT_FOUND", 404);
  if (thread.senderId !== userId && thread.travelerId !== userId) {
    throw new HttpError("FORBIDDEN", 403);
  }
  return thread;
}

/**
 * Опрос новых сообщений. Клиент передаёт ?after=<isoDate> и получает только
 * то, что появилось позже — вебсокеты для двух-трёх реплик избыточны.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await loadThread(id, user.id);

    const after = new URL(req.url).searchParams.get("after");
    const afterDate = after ? new Date(after) : null;
    const validAfter =
      afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

    const messages = await prisma.message.findMany({
      where: {
        threadId: id,
        // Не gt, а gte: при строгом сравнении сообщение, попавшее в ту же
        // миллисекунду, что и последнее известное, не пришло бы никогда.
        // Повтор безвреден — клиент отсеивает уже виденные по id.
        ...(validAfter ? { createdAt: { gte: validAfter } } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        text: true,
        createdAt: true,
        authorId: true,
      },
    });

    // Входящие помечаем прочитанными — счётчик непрочитанных живёт на этом.
    if (messages.some((m) => m.authorId !== user.id)) {
      await prisma.message.updateMany({
        where: { threadId: id, authorId: { not: user.id }, readAt: null },
        data: { readAt: new Date() },
      });
    }

    return {
      messages: messages.map((m) => ({
        id: m.id,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
        mine: m.authorId === user.id,
      })),
    };
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const thread = await loadThread(id, user.id);
    const { text } = messageSchema.parse(await req.json());

    const message = await prisma.message.create({
      data: { threadId: id, authorId: user.id, text },
      select: { id: true, text: true, createdAt: true },
    });

    await prisma.thread.update({
      where: { id },
      data: { lastMessageAt: message.createdAt },
    });

    const recipientId =
      thread.senderId === user.id ? thread.travelerId : thread.senderId;

    await notifyNewMessage({
      recipientId,
      authorName: displayName(user.firstName, user.lastName),
      listingTitle: thread.listing.title,
      text,
      threadId: id,
    });

    return {
      message: {
        id: message.id,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
        mine: true,
      },
    };
  });
}
