import { handle, HttpError } from "@/lib/api";
import { botUsername } from "@/lib/env";
import { createLoginCode, deepLink, webLink } from "@/lib/loginCode";

/** Выдаёт одноразовый код и ссылки для входа через приложение Telegram. */
export async function POST() {
  return handle(async () => {
    if (!botUsername) throw new HttpError("BOT_NOT_CONFIGURED", 503);

    const { code, expiresAt } = await createLoginCode();

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      deepLink: deepLink(botUsername, code),
      webLink: webLink(botUsername, code),
    };
  });
}
