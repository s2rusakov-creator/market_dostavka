import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Выбор канала уведомления.
 *
 * Правило простое: есть живое устройство — шлём пуш; не осталось ни одного —
 * падаем на Telegram. Здесь проверяется именно оно, поэтому обе службы
 * доставки подменены: настоящие ушли бы в сеть.
 */

type PushPayload = { title: string; body: string; path: string; badge?: number };

const sendPush = vi.fn(
  async (_tokens: string[], _message: PushPayload) =>
    ({ sent: 1, dead: [] as string[] })
);
const isPushConfigured = vi.fn(() => true);
const sendTelegramMessage = vi.fn(
  async (_id: bigint | string, _text: string) => true
);

vi.mock("@/lib/push", () => ({
  sendPush: (tokens: string[], message: PushPayload) => sendPush(tokens, message),
  isPushConfigured: () => isPushConfigured(),
}));

vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: (id: bigint | string, text: string) =>
    sendTelegramMessage(id, text),
}));

const { prisma } = await import("@/lib/prisma");
const { registerDevice, deviceTokens } = await import("@/lib/devices");
const { notifyNewMessage, notifyNewResponse } = await import("@/lib/notify");

async function recipient(
  overrides: Partial<{
    telegramId: bigint | null;
    locale: string;
    notifyEnabled: boolean;
    notifyPreview: boolean;
  }> = {}
) {
  return prisma.user.create({
    data: {
      firstName: "Марина",
      telegramId: overrides.telegramId === undefined ? 100n : overrides.telegramId,
      locale: overrides.locale ?? "ru",
      notifyEnabled: overrides.notifyEnabled ?? true,
      notifyPreview: overrides.notifyPreview ?? true,
    },
  });
}

const message = (recipientId: string) => ({
  recipientId,
  authorName: "Рустам А.",
  listingTitle: "Документы, папка А4",
  text: "Здравствуйте, лечу 26-го",
  threadId: "поток-1",
});

beforeEach(async () => {
  await prisma.user.deleteMany({});
  sendPush.mockReset();
  sendPush.mockResolvedValue({ sent: 1, dead: [] });
  isPushConfigured.mockReset();
  isPushConfigured.mockReturnValue(true);
  sendTelegramMessage.mockReset();
  sendTelegramMessage.mockResolvedValue(true);
});

describe("какой канал выбирается", () => {
  it("есть устройство — идёт пуш, Telegram молчит", async () => {
    const user = await recipient();
    await registerDevice({ userId: user.id, token: "телефон", platform: "android" });

    await notifyNewMessage(message(user.id));

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("устройств нет — уходит в Telegram", async () => {
    const user = await recipient();

    await notifyNewMessage(message(user.id));

    expect(sendPush).not.toHaveBeenCalled();
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it("пуш не доехал ни до одного устройства — выручает Telegram", async () => {
    const user = await recipient();
    await registerDevice({ userId: user.id, token: "телефон", platform: "android" });
    sendPush.mockResolvedValue({ sent: 0, dead: [] });

    await notifyNewMessage(message(user.id));

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it("пуши не настроены — сразу Telegram, устройства не спрашиваем", async () => {
    const user = await recipient();
    await registerDevice({ userId: user.id, token: "телефон", platform: "android" });
    isPushConfigured.mockReturnValue(false);

    await notifyNewMessage(message(user.id));

    expect(sendPush).not.toHaveBeenCalled();
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it("ни устройств, ни Telegram — молчим, а не падаем", async () => {
    const user = await recipient({ telegramId: null });

    await expect(notifyNewMessage(message(user.id))).resolves.toBeUndefined();
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("человек выключил уведомления — тишина в обоих каналах", async () => {
    const user = await recipient({ notifyEnabled: false });
    await registerDevice({ userId: user.id, token: "телефон", platform: "android" });

    await notifyNewMessage(message(user.id));

    expect(sendPush).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("несуществующий получатель не роняет отправку", async () => {
    await expect(notifyNewMessage(message("нет-такого"))).resolves.toBeUndefined();
  });
});

describe("мёртвые токены", () => {
  it("удаляются, как только FCM о них сообщил", async () => {
    const user = await recipient();
    await registerDevice({ userId: user.id, token: "живой", platform: "android" });
    await registerDevice({ userId: user.id, token: "мёртвый", platform: "android" });
    sendPush.mockResolvedValue({ sent: 1, dead: ["мёртвый"] });

    await notifyNewMessage(message(user.id));

    expect(await deviceTokens(user.id)).toEqual(["живой"]);
  });
});

describe("что видно на экране блокировки", () => {
  it("с включённым превью — имя и текст", async () => {
    const user = await recipient({ notifyPreview: true });
    await registerDevice({ userId: user.id, token: "т", platform: "android" });

    await notifyNewMessage(message(user.id));

    const [, payload] = sendPush.mock.calls[0] as [string[], { title: string; body: string }];
    expect(payload.title).toBe("Рустам А.");
    expect(payload.body).toContain("лечу 26-го");
  });

  it("с выключенным — ни имени, ни текста", async () => {
    const user = await recipient({ notifyPreview: false });
    await registerDevice({ userId: user.id, token: "т", platform: "android" });

    await notifyNewMessage(message(user.id));

    const [, payload] = sendPush.mock.calls[0] as [string[], { title: string; body: string }];
    expect(payload.title).toBe("Новое сообщение");
    expect(payload.body).not.toContain("лечу 26-го");
    expect(payload.body).not.toContain("Рустам");
  });

  it("длинное сообщение обрезается", async () => {
    const user = await recipient();
    await registerDevice({ userId: user.id, token: "т", platform: "android" });

    await notifyNewMessage({ ...message(user.id), text: "я".repeat(500) });

    const [, payload] = sendPush.mock.calls[0] as [string[], { body: string }];
    expect(payload.body.length).toBeLessThanOrEqual(301);
    expect(payload.body.endsWith("…")).toBe(true);
  });

  it("отклик показывается целиком независимо от настройки", async () => {
    const user = await recipient({ notifyPreview: false });
    await registerDevice({ userId: user.id, token: "т", platform: "android" });

    await notifyNewResponse({
      recipientId: user.id,
      travelerName: "Рустам А.",
      listingTitle: "Документы, папка А4",
      threadId: "поток-1",
    });

    const [, payload] = sendPush.mock.calls[0] as [string[], { body: string }];
    // Отклик — это факт, а не переписка: и имя, и заявка видны в ленте всем.
    expect(payload.body).toContain("Рустам А.");
  });
});

describe("куда ведёт нажатие", () => {
  it("в нужный чат, а не на главную", async () => {
    const user = await recipient();
    await registerDevice({ userId: user.id, token: "т", platform: "android" });

    await notifyNewMessage(message(user.id));

    const [, payload] = sendPush.mock.calls[0] as [string[], { path: string }];
    expect(payload.path).toBe("/chats/поток-1");
  });

  it("у азербайджанской версии путь с префиксом языка", async () => {
    const user = await recipient({ locale: "az" });
    await registerDevice({ userId: user.id, token: "т", platform: "android" });

    await notifyNewMessage(message(user.id));

    const [, payload] = sendPush.mock.calls[0] as [string[], { path: string; title: string }];
    expect(payload.path).toBe("/az/chats/поток-1");
  });

  it("азербайджанцу с выключенным превью текст тоже на его языке", async () => {
    const user = await recipient({ locale: "az", notifyPreview: false });
    await registerDevice({ userId: user.id, token: "т", platform: "android" });

    await notifyNewMessage(message(user.id));

    const [, payload] = sendPush.mock.calls[0] as [string[], { title: string }];
    expect(payload.title).toBe("Yeni mesaj");
  });
});
