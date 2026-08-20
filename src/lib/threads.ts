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
        orderBy: { createdAt: "desc" },
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
        orderBy: { createdAt: "asc" },
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
