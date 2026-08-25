import { type NextRequest } from "next/server";
import { handle, HttpError } from "@/lib/api";
import { buildAuthorizeUrl, isConfigured, isProvider, randomToken } from "@/lib/oauth";
import { packState } from "@/lib/oauthState";
import { createLoginCode } from "@/lib/loginCode";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";

/**
 * Начало входа через провайдера для приложения.
 *
 * Отдельно от обычного start, потому что путь другой. В браузере хватает
 * перенаправления: ушли к Google и вернулись в ту же вкладку. Приложение так
 * не может — окно провайдера открывается в браузере телефона, и вход
 * заканчивается там же, в чужом хранилище cookie.
 *
 * Поэтому здесь выдаётся код пары. Браузер, закончив вход, привяжет к этому
 * коду человека, а приложение, опрашивая /auth/link/status, заберёт сессию
 * себе. Ровно тот же приём, что уже работает для входа через Telegram.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  return handle(async () => {
    const { provider } = await params;
    if (!isProvider(provider) || !isConfigured(provider)) {
      throw new HttpError("PROVIDER", 400);
    }

    // Язык нужен, чтобы страницу «вернитесь в приложение» человек увидел
    // на своём языке: она откроется в браузере, где о наших настройках
    // ничего не известно.
    const asked = await req.json().catch(() => null);
    const wanted = (asked as { locale?: unknown } | null)?.locale;
    const locale = hasLocale(routing.locales, wanted)
      ? wanted
      : routing.defaultLocale;

    const codeVerifier = randomToken();
    const { code, expiresAt } = await createLoginCode();

    const state = await packState({ provider, pair: code, codeVerifier, locale });

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      url: buildAuthorizeUrl({
        id: provider,
        // Адрес возврата buildAuthorizeUrl приведёт к каноническому сам:
        // с личного адреса деплоя провайдер ссылку не узнает.
        origin: req.nextUrl.origin,
        state,
        codeVerifier,
      }),
    };
  });
}
