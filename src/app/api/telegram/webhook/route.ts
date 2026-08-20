import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Приёмник обновлений от Telegram.
 *
 * Сюда приходит /start <код> после того, как человек открыл бота по ссылке
 * со страницы входа. Находим код, привязываем к нему пользователя — дальше
 * страница входа сама заберёт сессию, опрашивая /api/auth/link/status.
 */

type TelegramUpdate = {
  message?: {
    text?: string;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
};

const GREETING = {
  ru: "Вход подтверждён. Возвращайтесь на сайт — он уже пустил вас внутрь.",
  expired: "Ссылка устарела. Откройте вход на сайте заново.",
  unknown: "Здравствуйте! Чтобы войти, нажмите «Войти» на сайте YOL.",
};

export async function POST(req: NextRequest) {
  // Telegram шлёт секрет заголовком — иначе вебхук может дёрнуть кто угодно.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || got !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const from = message?.from;
  const text = message?.text?.trim() ?? "";

  // Telegram ждёт быстрый 200 на любое обновление, иначе будет ретраить.
  if (!from || !text.startsWith("/start")) {
    return NextResponse.json({ ok: true });
  }

  const code = text.split(/\s+/)[1];
  if (!code) {
    await sendTelegramMessage(BigInt(from.id), GREETING.unknown);
    return NextResponse.json({ ok: true });
  }

  try {
    const entry = await prisma.loginCode.findUnique({ where: { code } });
    if (!entry || entry.consumedAt || entry.expiresAt.getTime() < Date.now()) {
      await sendTelegramMessage(BigInt(from.id), GREETING.expired);
      return NextResponse.json({ ok: true });
    }

    const telegramId = BigInt(from.id);
    const user = await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName: from.first_name || "Пользователь",
        lastName: from.last_name ?? null,
        username: from.username ?? null,
      },
      update: {
        firstName: from.first_name || "Пользователь",
        lastName: from.last_name ?? null,
        username: from.username ?? null,
      },
    });

    await prisma.loginCode.update({
      where: { code },
      data: { telegramId, userId: user.id },
    });

    await sendTelegramMessage(telegramId, GREETING.ru);
  } catch (err) {
    // Ошибку глотаем: если ответить не-200, Telegram начнёт слать повторы.
    console.error("telegram webhook error", err);
  }

  return NextResponse.json({ ok: true });
}
