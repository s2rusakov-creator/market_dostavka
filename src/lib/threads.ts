import "server-only";
import { prisma } from "./prisma";
import { displayName } from "./format";

export type ThreadListItem = {
  id: string;
  listingTitle: string;
  listingPriceRub: number;
  otherName: string;
  otherFirstName: string;
  otherLastName: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: number;
};

export async function getThreads(userId: string): Promise<ThreadListItem[]> {
  const threads = await prisma.thread.findMany({
    where: { OR: [{ senderId: userId }, { travelerId: userId }] },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      listing: { select: { title: true, priceRub: true } },
      sender: { select: { id: true, firstName: true, lastName: true } },
      traveler: { select: { id: true, firstName: true, lastName: true } },
      messages: {
        // Время хранится с точностью до миллисекунды, и два сообщения
        // могут совпасть. Тогда порядок решает id — иначе в превью
        // попадает произвольное из них.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { text: true },
      },
      _count: {
        select: {
          messages: { where: { authorId: { not: userId }, readAt: null } },
        },
      },
    },
  });

  return threads.map((th) => {
    const other = th.sender.id === userId ? th.traveler : th.sender;
    return {
      id: th.id,
      listingTitle: th.listing.title,
      listingPriceRub: th.listing.priceRub,
      otherName: displayName(other.firstName, other.lastName),
      otherFirstName: other.firstName,
      otherLastName: other.lastName,
      lastMessage: th.messages[0]?.text ?? null,
      lastMessageAt: th.lastMessageAt.toISOString(),
      unread: th._count.messages,
    };
  });
}

/**
 * Сколько всего непрочитанных сообщений у человека во всех переписках.
 * Нужно для значка на иконке приложения — он один на всё приложение.
 */
export async function unreadCount(userId: string): Promise<number> {
  return prisma.message.count({
    where: {
      authorId: { not: userId },
      readAt: null,
      thread: { OR: [{ senderId: userId }, { travelerId: userId }] },
    },
  });
}

export type MessageCursor = {
  /** ISO-время последнего известного клиенту сообщения. */
  after: string | null;
  /** Его id. Нужен, чтобы различить сообщения одной миллисекунды. */
  afterId: string | null;
};

export type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  mine: boolean;
};

/**
 * Сообщения строго новее курсора.
 *
 * Курсор — пара «время и id». Одного времени мало: два сообщения попадают в
 * одну миллисекунду, и при сравнении только по времени второе не пришло бы
 * никогда. Раньше это обходили нестрогим сравнением, но тогда последнее
 * известное сообщение возвращалось на каждом тике опроса — пустой ответ
 * переставал быть пустым.
 *
 * Битое время в курсоре не ошибка: отдаём переписку с начала, клиент отсеет
 * уже виденное по id.
 */
export async function getMessagesSince(
  threadId: string,
  userId: string,
  cursor: MessageCursor
): Promise<ChatMessage[]> {
  const afterDate = cursor.after ? new Date(cursor.after) : null;
  const validAfter =
    afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

  const messages = await prisma.message.findMany({
    where: {
      threadId,
      ...(validAfter
        ? {
            OR: [
              { createdAt: { gt: validAfter } },
              ...(cursor.afterId
                ? [{ createdAt: validAfter, id: { gt: cursor.afterId } }]
                : []),
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 200,
    select: { id: true, text: true, createdAt: true, authorId: true },
  });

  return messages.map((m) => ({
    id: m.id,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    mine: m.authorId === userId,
  }));
}

/**
 * Отмечает входящие сообщения переписки прочитанными.
 *
 * Вызывается в двух местах: при открытии чата и в опросе, который действительно
 * принёс чужие сообщения. Раньше этим занимался только опрос, и держался он на
 * побочном эффекте: курсор сравнивался нестрого, последнее известное сообщение
 * приходило на каждом тике заново, и если оно было чужим, следом уходил UPDATE,
 * не менявший ни одной строки. Со строгим курсором такой опрос перестал бы
 * отмечать что-либо вовсе.
 */
export async function markThreadRead(
  threadId: string,
  userId: string
): Promise<void> {
  await prisma.message.updateMany({
    where: { threadId, authorId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
}

export type ThreadDetail = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPriceRub: number;
  otherName: string;
  otherFirstName: string;
  otherLastName: string | null;
  messages: { id: string; text: string; createdAt: string; mine: boolean }[];
};

export async function getThread(
  id: string,
  userId: string
): Promise<ThreadDetail | null> {
  const th = await prisma.thread.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, priceRub: true } },
      sender: { select: { id: true, firstName: true, lastName: true } },
      traveler: { select: { id: true, firstName: true, lastName: true } },
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 200,
        select: { id: true, text: true, createdAt: true, authorId: true },
      },
    },
  });

  if (!th) return null;
  // Чат виден только двум его участникам — третьему отдаём 404, а не 403.
  if (th.senderId !== userId && th.travelerId !== userId) return null;

  const other = th.sender.id === userId ? th.traveler : th.sender;

  return {
    id: th.id,
    listingId: th.listing.id,
    listingTitle: th.listing.title,
    listingPriceRub: th.listing.priceRub,
    otherName: displayName(other.firstName, other.lastName),
    otherFirstName: other.firstName,
    otherLastName: other.lastName,
    messages: th.messages.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      mine: m.authorId === userId,
    })),
  };
}
