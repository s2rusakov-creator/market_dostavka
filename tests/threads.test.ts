import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getThread, getThreads } from "@/lib/threads";

const DAY = 86400e3;

async function scene() {
  const sender = await prisma.user.create({
    data: { firstName: "Марина", lastName: "Кулиева", telegramId: 1n },
  });
  const traveler = await prisma.user.create({
    data: { firstName: "Рустам", lastName: "Алиев", telegramId: 2n },
  });
  const stranger = await prisma.user.create({
    data: { firstName: "Лейла", telegramId: 3n },
  });

  const listing = await prisma.listing.create({
    data: {
      authorId: sender.id,
      category: "DOCUMENTS",
      title: "Документы, папка А4",
      priceRub: 3000,
      deadlineTo: new Date(Date.now() + DAY),
    },
  });

  const thread = await prisma.thread.create({
    data: {
      listingId: listing.id,
      senderId: sender.id,
      travelerId: traveler.id,
    },
  });

  return { sender, traveler, stranger, listing, thread };
}

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("getThread — доступ", () => {
  it("участники переписку видят", async () => {
    const { sender, traveler, thread } = await scene();

    expect(await getThread(thread.id, sender.id)).not.toBeNull();
    expect(await getThread(thread.id, traveler.id)).not.toBeNull();
  });

  it("посторонний не видит чужую переписку", async () => {
    const { stranger, thread } = await scene();
    expect(await getThread(thread.id, stranger.id)).toBeNull();
  });

  it("несуществующий чат — тоже null, без подсказок", async () => {
    const { sender } = await scene();
    expect(await getThread("нет-такого", sender.id)).toBeNull();
  });

  it("каждому показывается собеседник, а не он сам", async () => {
    const { sender, traveler, thread } = await scene();

    const forSender = await getThread(thread.id, sender.id);
    const forTraveler = await getThread(thread.id, traveler.id);

    expect(forSender?.otherName).toBe("Рустам А.");
    expect(forTraveler?.otherName).toBe("Марина К.");
  });

  it("свои и чужие сообщения различаются", async () => {
    const { sender, traveler, thread } = await scene();

    await prisma.message.create({
      data: { threadId: thread.id, authorId: sender.id, text: "Здравствуйте" },
    });
    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "Лечу 23-го" },
    });

    const forSender = await getThread(thread.id, sender.id);
    expect(forSender?.messages.map((m) => m.mine)).toEqual([true, false]);

    const forTraveler = await getThread(thread.id, traveler.id);
    expect(forTraveler?.messages.map((m) => m.mine)).toEqual([false, true]);
  });

  it("сообщения идут в порядке отправки", async () => {
    const { sender, thread } = await scene();

    for (const text of ["первое", "второе", "третье"]) {
      await prisma.message.create({
        data: { threadId: thread.id, authorId: sender.id, text },
      });
    }

    const detail = await getThread(thread.id, sender.id);
    expect(detail?.messages.map((m) => m.text)).toEqual([
      "первое",
      "второе",
      "третье",
    ]);
  });
});

describe("getThreads — список", () => {
  it("непрочитанными считаются только чужие сообщения", async () => {
    const { sender, traveler, thread } = await scene();

    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "раз" },
    });
    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "два" },
    });
    await prisma.message.create({
      data: { threadId: thread.id, authorId: sender.id, text: "мой ответ" },
    });

    const forSender = await getThreads(sender.id);
    expect(forSender[0].unread).toBe(2);

    // У путешественника непрочитано только сообщение отправителя.
    const forTraveler = await getThreads(traveler.id);
    expect(forTraveler[0].unread).toBe(1);
  });

  it("прочитанные не считаются", async () => {
    const { sender, traveler, thread } = await scene();

    await prisma.message.create({
      data: {
        threadId: thread.id,
        authorId: traveler.id,
        text: "прочитано",
        readAt: new Date(),
      },
    });

    expect((await getThreads(sender.id))[0].unread).toBe(0);
  });

  it("посторонний чужих чатов не видит", async () => {
    const { stranger } = await scene();
    expect(await getThreads(stranger.id)).toHaveLength(0);
  });

  it("последнее сообщение попадает в превью", async () => {
    const { sender, traveler, thread } = await scene();

    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "старое" },
    });
    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "самое свежее" },
    });

    expect((await getThreads(sender.id))[0].lastMessage).toBe("самое свежее");
  });

  it("свежие переписки идут первыми", async () => {
    const { sender, traveler, listing } = await scene();

    const older = await prisma.thread.findFirstOrThrow();
    await prisma.thread.update({
      where: { id: older.id },
      data: { lastMessageAt: new Date(Date.now() - DAY) },
    });

    const second = await prisma.user.create({
      data: { firstName: "Артём", telegramId: 4n },
    });
    const fresh = await prisma.thread.create({
      data: {
        listingId: listing.id,
        senderId: sender.id,
        travelerId: second.id,
        lastMessageAt: new Date(),
      },
    });

    const list = await getThreads(sender.id);
    expect(list[0].id).toBe(fresh.id);
    expect(list).toHaveLength(2);
    expect(traveler.id).toBeTruthy();
  });
});
