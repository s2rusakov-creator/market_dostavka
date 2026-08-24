import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { messageSchema } from "@/lib/validation";
import { notifyNewMessage } from "@/lib/notify";
import { displayName } from "@/lib/format";
import { getMessagesSince, markThreadRead } from "@/lib/threads";

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
 * Опрос новых сообщений. Вебсокеты для двух-трёх реплик избыточны.
 *
 * Курсор — пара «время и id», клиент передаёт `?after=<isoDate>&afterId=<id>`.
 * Одного времени мало: два сообщения попадают в одну миллисекунду, и при
 * строгом сравнении по времени второе не пришло бы никогда. Раньше это
 * обходили нестрогим `gte`, но тогда последнее известное сообщение
 * возвращалось на каждом тике — пустой ответ переставал быть пустым, а следом
 * уходил лишний UPDATE отметки о прочтении. Пара решает обе задачи разом.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await loadThread(id, user.id);

    const query = new URL(req.url).searchParams;
    const messages = await getMessagesSince(id, user.id, {
      after: query.get("after"),
      afterId: query.get("afterId"),
    });

    // Отмечаем прочтение только когда опрос правда принёс чужие сообщения.
    // При открытии переписки это делает страница чата — см. markThreadRead.
    if (messages.some((m) => !m.mine)) {
      await markThreadRead(id, user.id);
    }

    return { messages };
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

    // Уведомление уходит после ответа: человек не должен ждать Telegram,
    // чтобы увидеть собственное сообщение в переписке. `after` держит
    // serverless-функцию живой до конца работы — простой fetch без ожидания
    // на Vercel оборвался бы вместе с ней.
    after(async () => {
      await notifyNewMessage({
        recipientId,
        authorName: displayName(user.firstName, user.lastName),
        listingTitle: thread.listing.title,
        text,
        threadId: id,
      });
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
