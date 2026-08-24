import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  deviceTokens,
  dropDeadDevices,
  forgetDevice,
  registerDevice,
} from "@/lib/devices";

async function people() {
  const marina = await prisma.user.create({
    data: { firstName: "Марина", telegramId: 1n },
  });
  const rustam = await prisma.user.create({
    data: { firstName: "Рустам", telegramId: 2n },
  });
  return { marina, rustam };
}

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("registerDevice", () => {
  it("запоминает устройство за человеком", async () => {
    const { marina } = await people();

    await registerDevice({
      userId: marina.id,
      token: "токен-телефона",
      platform: "android",
    });

    expect(await deviceTokens(marina.id)).toEqual(["токен-телефона"]);
  });

  it("повторный запуск приложения не плодит записи", async () => {
    const { marina } = await people();

    for (let i = 0; i < 3; i++) {
      await registerDevice({
        userId: marina.id,
        token: "тот-же-токен",
        platform: "android",
      });
    }

    expect(await deviceTokens(marina.id)).toHaveLength(1);
  });

  it("у одного человека может быть несколько устройств", async () => {
    const { marina } = await people();

    await registerDevice({ userId: marina.id, token: "телефон", platform: "android" });
    await registerDevice({ userId: marina.id, token: "планшет", platform: "android" });

    expect((await deviceTokens(marina.id)).sort()).toEqual(["планшет", "телефон"]);
  });

  it("на телефоне сменился аккаунт — уведомления идут новому владельцу", async () => {
    const { marina, rustam } = await people();

    await registerDevice({ userId: marina.id, token: "один-телефон", platform: "android" });
    await registerDevice({ userId: rustam.id, token: "один-телефон", platform: "android" });

    // Прежней привязки остаться не должно: иначе на этот телефон полетели бы
    // чужие переписки.
    expect(await deviceTokens(marina.id)).toEqual([]);
    expect(await deviceTokens(rustam.id)).toEqual(["один-телефон"]);
  });

  it("отмечает время последнего захода", async () => {
    const { marina } = await people();
    await registerDevice({ userId: marina.id, token: "т", platform: "android" });

    const before = await prisma.deviceToken.findUniqueOrThrow({
      where: { token: "т" },
    });
    await new Promise((r) => setTimeout(r, 5));
    await registerDevice({ userId: marina.id, token: "т", platform: "android" });

    const after = await prisma.deviceToken.findUniqueOrThrow({
      where: { token: "т" },
    });
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
  });
});

describe("forgetDevice", () => {
  it("снимает своё устройство с учёта", async () => {
    const { marina } = await people();
    await registerDevice({ userId: marina.id, token: "мой", platform: "android" });

    await forgetDevice(marina.id, "мой");

    expect(await deviceTokens(marina.id)).toEqual([]);
  });

  it("чужое устройство отписать нельзя", async () => {
    const { marina, rustam } = await people();
    await registerDevice({ userId: marina.id, token: "чужой", platform: "android" });

    await forgetDevice(rustam.id, "чужой");

    expect(await deviceTokens(marina.id)).toEqual(["чужой"]);
  });
});

describe("dropDeadDevices", () => {
  it("убирает токены, о смерти которых сказал FCM", async () => {
    const { marina } = await people();
    await registerDevice({ userId: marina.id, token: "живой", platform: "android" });
    await registerDevice({ userId: marina.id, token: "мёртвый", platform: "android" });

    await dropDeadDevices(["мёртвый"]);

    expect(await deviceTokens(marina.id)).toEqual(["живой"]);
  });

  it("пустой список ничего не ломает", async () => {
    const { marina } = await people();
    await registerDevice({ userId: marina.id, token: "живой", platform: "android" });

    await dropDeadDevices([]);

    expect(await deviceTokens(marina.id)).toEqual(["живой"]);
  });
});

describe("удаление аккаунта", () => {
  it("уносит устройства за собой", async () => {
    const { marina } = await people();
    await registerDevice({ userId: marina.id, token: "т", platform: "android" });

    await prisma.user.delete({ where: { id: marina.id } });

    expect(await prisma.deviceToken.count()).toBe(0);
  });
});
