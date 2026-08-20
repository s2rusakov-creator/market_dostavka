import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";

/**
 * Локальный вход без Telegram — чтобы можно было щупать приложение
 * до регистрации бота у BotFather.
 * Включается только явно: NODE_ENV != production И ALLOW_DEV_LOGIN=1.
 */
function devLoginAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "1"
  );
}

export async function POST(req: NextRequest) {
  if (!devLoginAllowed()) {
    return NextResponse.json({ error: "DISABLED" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    id?: string;
  };

  const name = (body.name || "Тестовый пользователь").slice(0, 40);
  const telegramId = BigInt(body.id || Math.floor(Math.random() * 1e9));

  const user = await prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, firstName: name },
    update: { firstName: name },
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true, id: user.id, name: user.firstName });
}
