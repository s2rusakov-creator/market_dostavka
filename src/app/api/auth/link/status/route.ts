import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { apiError } from "@/lib/api";

/**
 * Страница входа опрашивает этот адрес, пока человек подтверждает вход в
 * Telegram. Как только бот получил /start с этим кодом, здесь выдаётся сессия.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return apiError("NO_CODE", 400);

  const entry = await prisma.loginCode.findUnique({ where: { code } });

  // Неизвестный код, просроченный или уже обменянный — все три случая
  // снаружи выглядят одинаково, чтобы не давать подсказок перебирающему.
  if (!entry || entry.consumedAt || entry.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ status: "expired" });
  }

  if (!entry.userId) {
    return NextResponse.json({ status: "pending" });
  }

  // Код гасим до выдачи сессии: даже при гонке второй запрос уйдёт ни с чем.
  const consumed = await prisma.loginCode.updateMany({
    where: { code, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    return NextResponse.json({ status: "expired" });
  }

  await createSession(entry.userId);
  return NextResponse.json({ status: "ok" });
}
