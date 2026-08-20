import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { createSession } from "@/lib/session";
import { normalizeEmail, verifyPassword } from "@/lib/password";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

/** После стольких неудач подряд аккаунт временно закрывается. */
const MAX_FAILED = 7;
const LOCK_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  return handle(async () => {
    const data = schema.parse(await req.json());
    const email = normalizeEmail(data.email);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        failedLoginCount: true,
        lockedUntil: true,
      },
    });

    // Несуществующий адрес и неверный пароль отвечают одинаково, иначе форма
    // входа превращается в способ узнать, кто здесь зарегистрирован.
    if (!user || !user.passwordHash) {
      throw new HttpError("BAD_CREDENTIALS", 401);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpError("TOO_MANY_ATTEMPTS", 429);
    }

    const ok = await verifyPassword(data.password, user.passwordHash);

    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil:
            failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null,
        },
      });
      throw new HttpError("BAD_CREDENTIALS", 401);
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    await createSession(user.id);
    return { ok: true };
  });
}
