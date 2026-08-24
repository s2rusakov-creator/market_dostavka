import "server-only";
import { prisma } from "./prisma";

/**
 * Устройства, на которые человек получает пуши.
 *
 * Токен выдаёт служба доставки на самом устройстве, и он живёт своей жизнью:
 * меняется при переустановке приложения, протухает, переезжает вместе с
 * телефоном к другому владельцу аккаунта. Поэтому уникален именно токен, а не
 * пара «человек и платформа», а привязка обновляется при каждом заходе.
 */

export type DevicePlatform = "android" | "ios" | "web";

/**
 * Запоминает устройство за человеком.
 *
 * Если этот токен уже был закреплён за другим аккаунтом — значит на телефоне
 * сменился пользователь, и уведомления должны пойти новому. Прежней записи
 * при этом остаться не должно: иначе на чужой телефон полетят чужие
 * переписки.
 */
export async function registerDevice(params: {
  userId: string;
  token: string;
  platform: DevicePlatform;
  provider?: string;
}): Promise<void> {
  const now = new Date();
  await prisma.deviceToken.upsert({
    where: { token: params.token },
    create: {
      userId: params.userId,
      token: params.token,
      platform: params.platform,
      provider: params.provider ?? "fcm",
    },
    update: {
      userId: params.userId,
      platform: params.platform,
      provider: params.provider ?? "fcm",
      lastSeenAt: now,
    },
  });
}

/**
 * Снимает устройство с учёта — при выходе из аккаунта.
 *
 * Проверяем владельца: иначе чужим токеном можно было бы отписать чужой
 * телефон от уведомлений.
 */
export async function forgetDevice(
  userId: string,
  token: string
): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token, userId } });
}

/** Токены всех устройств человека. */
export async function deviceTokens(userId: string): Promise<string[]> {
  const rows = await prisma.deviceToken.findMany({
    where: { userId },
    select: { token: true },
  });
  return rows.map((r) => r.token);
}

/**
 * Убирает токены, о смерти которых сообщила служба доставки.
 *
 * Без этого каждое уведомление тратило бы круг до Google на устройство,
 * которого давно нет.
 */
export async function dropDeadDevices(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
}
