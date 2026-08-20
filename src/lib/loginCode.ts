import "server-only";
import crypto from "node:crypto";
import { prisma } from "./prisma";

/**
 * Одноразовые коды для входа через диплинк бота.
 *
 * Код уезжает в Telegram параметром /start, поэтому он короткий, но берётся
 * из криптографического генератора: 20 символов алфавита в 32 знака — это
 * около 100 бит энтропии, перебирать бессмысленно.
 */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // без похожих 0/o, 1/l
const CODE_LENGTH = 20;
const TTL_MS = 5 * 60 * 1000;

export function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export async function createLoginCode(): Promise<{
  code: string;
  expiresAt: Date;
}> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.loginCode.create({ data: { code, expiresAt } });

  // Заодно подчищаем протухшие, чтобы таблица не росла бесконечно.
  await prisma.loginCode
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - TTL_MS) } } })
    .catch(() => {});

  return { code, expiresAt };
}

/** Ссылка, которую откроет установленное приложение Telegram, минуя сайты. */
export function deepLink(botUsername: string, code: string): string {
  return `tg://resolve?domain=${encodeURIComponent(botUsername)}&start=${code}`;
}

/** Запасной вариант через t.me — на случай, если схема tg:// не сработала. */
export function webLink(botUsername: string, code: string): string {
  return `https://t.me/${encodeURIComponent(botUsername)}?start=${code}`;
}
