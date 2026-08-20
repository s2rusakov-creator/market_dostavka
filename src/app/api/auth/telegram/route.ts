import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { verifyTelegramAuth, type TelegramAuthPayload } from "@/lib/telegram";

/** Telegram-виджет дёргает этот адрес GET-запросом с подписанными параметрами. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const payload = {
    id: sp.get("id") ?? "",
    first_name: sp.get("first_name") ?? "",
    last_name: sp.get("last_name") ?? undefined,
    username: sp.get("username") ?? undefined,
    photo_url: sp.get("photo_url") ?? undefined,
    auth_date: sp.get("auth_date") ?? "",
    hash: sp.get("hash") ?? "",
  } as TelegramAuthPayload;

  if (!payload.id || !verifyTelegramAuth(payload)) {
    return NextResponse.redirect(new URL("/login?error=telegram", req.url));
  }

  const telegramId = BigInt(payload.id);
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      firstName: payload.first_name || "Пользователь",
      lastName: payload.last_name ?? null,
      username: payload.username ?? null,
      photoUrl: payload.photo_url ?? null,
    },
    update: {
      firstName: payload.first_name || "Пользователь",
      lastName: payload.last_name ?? null,
      username: payload.username ?? null,
      photoUrl: payload.photo_url ?? null,
    },
  });

  await createSession(user.id);

  const next = sp.get("next");
  // Открытый редирект недопустим — принимаем только внутренние пути.
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(new URL(dest, req.url));
}
