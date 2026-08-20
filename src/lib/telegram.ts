import crypto from "node:crypto";
import { botToken } from "./env";

export type TelegramAuthPayload = {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

/** Данные виджета старше суток не принимаем — защита от повторной отправки. */
const MAX_AUTH_AGE_SEC = 24 * 60 * 60;

/**
 * Проверка подписи Telegram Login Widget.
 * secret = SHA256(bot_token), затем HMAC-SHA256 по строке "key=value", отсортированной по ключу.
 */
export function verifyTelegramAuth(data: TelegramAuthPayload): boolean {
  const token = botToken();
  if (!token) return false;

  const { hash, ...rest } = data;
  if (!hash) return false;

  const checkString = Object.keys(rest)
    .filter((k) => rest[k as keyof typeof rest] !== undefined)
    .sort()
    .map((k) => `${k}=${rest[k as keyof typeof rest]}`)
    .join("\n");

  const secret = crypto.createHash("sha256").update(token).digest();
  const computed = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate)) return false;
  return Math.floor(Date.now() / 1000) - authDate <= MAX_AUTH_AGE_SEC;
}

/**
 * Пуш в Telegram. Уведомления — единственный способ вернуть человека на площадку,
 * но падать из-за них нельзя: ошибку глотаем и логируем.
 */
export async function sendTelegramMessage(
  telegramId: bigint | string,
  text: string
): Promise<boolean> {
  const token = botToken();
  if (!token) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId.toString(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("telegram sendMessage failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("telegram sendMessage error", err);
    return false;
  }
}
