/** Значения читаются лениво: без них приложение должно подниматься и показывать ленту. */
export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function sessionSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET не задан или короче 32 символов — задайте его в .env"
    );
  }
  return new TextEncoder().encode(raw);
}

export const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";
