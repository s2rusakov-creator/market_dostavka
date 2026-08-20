import { NextResponse, type NextRequest } from "next/server";
import { botToken } from "@/lib/env";

/**
 * Разовая регистрация вебхука бота.
 *
 * Обычно это делают запросом к api.telegram.org со своей машины, но из России
 * он недоступен. Здесь запрос уходит с серверов Vercel, поэтому достаточно
 * открыть адрес в браузере:
 *
 *   /api/telegram/setup?secret=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Тем же адресом можно проверить состояние: ?secret=…&info=1
 */
export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = botToken();

  if (!secret || !token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN или TELEGRAM_WEBHOOK_SECRET не заданы" },
      { status: 503 }
    );
  }
  if (req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const base = `https://api.telegram.org/bot${token}`;

  try {
    if (req.nextUrl.searchParams.get("info")) {
      const res = await fetch(`${base}/getWebhookInfo`, {
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as { result?: Record<string, unknown> };
      return NextResponse.json({ webhook: data.result ?? null });
    }

    const url = `${req.nextUrl.origin}/api/telegram/webhook`;
    const res = await fetch(`${base}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as { ok?: boolean; description?: string };
    return NextResponse.json({
      ok: data.ok === true,
      url,
      description: data.description ?? null,
    });
  } catch (err) {
    console.error("telegram setup error", err);
    return NextResponse.json({ error: "TELEGRAM_UNREACHABLE" }, { status: 502 });
  }
}
