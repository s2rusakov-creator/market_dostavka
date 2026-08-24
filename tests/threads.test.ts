import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getMessagesSince,
  getThread,
  getThreads,
  markThreadRead,
} from "@/lib/threads";

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

describe("getMessagesSince — курсор опроса", () => {
  const noCursor = { after: null, afterId: null };

  it("без курсора отдаёт переписку целиком", async () => {
    const { sender, traveler, thread } = await scene();

    await prisma.message.create({
      data: { threadId: thread.id, authorId: sender.id, text: "раз" },
    });
    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "два" },
    });

    const all = await getMessagesSince(thread.id, sender.id, noCursor);
    expect(all.map((m) => m.text)).toEqual(["раз", "два"]);
    expect(all.map((m) => m.mine)).toEqual([true, false]);
  });

  it("на курсоре последнего сообщения ответ пустой", async () => {
    const { sender, thread } = await scene();

    await prisma.message.create({
      data: { threadId: thread.id, authorId: sender.id, text: "раз" },
    });

    const all = await getMessagesSince(thread.id, sender.id, noCursor);
    const last = all.at(-1)!;

    // Именно на этом ломался прежний нестрогий курсор: последнее сообщение
    // возвращалось снова и снова, а следом уходил лишний UPDATE.
    const again = await getMessagesSince(thread.id, sender.id, {
      after: last.createdAt,
      afterId: last.id,
    });
    expect(again).toEqual([]);
  });

  it("сообщение той же миллисекунды не теряется", async () => {
    const { sender, traveler, thread } = await scene();
    const sameInstant = new Date();

    await prisma.message.create({
      data: {
        threadId: thread.id,
        authorId: sender.id,
        text: "первое",
        createdAt: sameInstant,
      },
    });
    await prisma.message.create({
      data: {
        threadId: thread.id,
        authorId: traveler.id,
        text: "второе",
        createdAt: sameInstant,
      },
    });

    const all = await getMessagesSince(thread.id, sender.id, noCursor);
    expect(all).toHaveLength(2);

    // Клиент знает только первое из двух — второе обязано прийти.
    const after = await getMessagesSince(thread.id, sender.id, {
      after: all[0].createdAt,
      afterId: all[0].id,
    });
    expect(after.map((m) => m.text)).toEqual(["второе"]);
  });

  it("без id в курсоре сообщения той же миллисекунды пропускаются", async () => {
    const { sender, traveler, thread } = await scene();
    const sameInstant = new Date();

    for (const [author, text] of [
      [sender.id, "первое"],
      [traveler.id, "второе"],
    ] as const) {
      await prisma.message.create({
        data: { threadId: thread.id, authorId: author, text, createdAt: sameInstant },
      });
    }

    const all = await getMessagesSince(thread.id, sender.id, noCursor);

    // Старый клиент шлёт только время. Это осознанная плата за совместимость:
    // повтора не будет, но и соседа по миллисекунде он не увидит.
    const legacy = await getMessagesSince(thread.id, sender.id, {
      after: all[0].createdAt,
      afterId: null,
    });
    expect(legacy).toEqual([]);
  });

  it("битое время в курсоре не роняет опрос", async () => {
    const { sender, thread } = await scene();
    await prisma.message.create({
      data: { threadId: thread.id, authorId: sender.id, text: "раз" },
    });

    const messages = await getMessagesSince(thread.id, sender.id, {
      after: "не-дата",
      afterId: null,
    });
    expect(messages.map((m) => m.text)).toEqual(["раз"]);
  });

  it("чужие сообщения не подмешиваются из другой переписки", async () => {
    const { sender, traveler, listing, thread } = await scene();

    const other = await prisma.user.create({
      data: { firstName: "Артём", telegramId: 5n },
    });
    const otherThread = await prisma.thread.create({
      data: { listingId: listing.id, senderId: sender.id, travelerId: other.id },
    });

    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "сюда" },
    });
    await prisma.message.create({
      data: { threadId: otherThread.id, authorId: other.id, text: "не сюда" },
    });

    const messages = await getMessagesSince(thread.id, sender.id, noCursor);
    expect(messages.map((m) => m.text)).toEqual(["сюда"]);
  });
});

describe("markThreadRead", () => {
  it("гасит непрочитанное собеседника и не трогает своё", async () => {
    const { sender, traveler, thread } = await scene();

    await prisma.message.create({
      data: { threadId: thread.id, authorId: traveler.id, text: "чужое" },
    });
    await prisma.message.create({
      data: { threadId: thread.id, authorId: sender.id, text: "своё" },
    });

    expect((await getThreads(sender.id))[0].unread).toBe(1);

    await markThreadRead(thread.id, sender.id);

    expect((await getThreads(sender.id))[0].unread).toBe(0);
    // У собеседника сообщение отправителя так и осталось непрочитанным.
    expect((await getThreads(traveler.id))[0].unread).toBe(1);
  });

  it("на пустой переписке ничего не ломает", async () => {
    const { sender, thread } = await scene();
    await expect(markThreadRead(thread.id, sender.id)).resolves.toBeUndefined();
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
