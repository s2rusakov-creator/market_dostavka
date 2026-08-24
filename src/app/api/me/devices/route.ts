import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { forgetDevice, registerDevice } from "@/lib/devices";

/**
 * Учёт устройств для пушей.
 *
 * Токен приходит из оболочки приложения: службу доставки спрашивает она, а
 * сайт внутри неё пересылает результат сюда. Регистрация повторяется при
 * каждом запуске — токен меняется сам по себе, и последняя запись всегда
 * должна быть свежей.
 */

const registerSchema = z.object({
  // Токены FCM длинные; предел ставим с запасом, чтобы не отсечь живой.
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios", "web"]),
});

const forgetSchema = z.object({
  token: z.string().trim().min(20).max(4096),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = registerSchema.parse(await req.json());

    await registerDevice({
      userId: user.id,
      token: body.token,
      platform: body.platform,
    });

    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = forgetSchema.parse(await req.json());

    await forgetDevice(user.id, body.token);

    return { ok: true };
  });
}
