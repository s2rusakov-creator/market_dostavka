import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, fetchProfile, isConfigured, isProvider } from "@/lib/oauth";
import { unpackState } from "@/lib/oauthState";
import { findOrCreateOAuthUser } from "@/lib/accounts";
import { createSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasLocale } from "next-intl";
import { localePath, routing } from "@/i18n/routing";

const STATE_COOKIE = "yol_oauth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));

  if (!isProvider(provider) || !isConfigured(provider)) return fail("provider");

  const store = await cookies();
  const cookieState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // Провайдер может вернуть отказ — пользователь передумал.
  if (req.nextUrl.searchParams.get("error")) return fail("cancelled");
  if (!code || !state) return fail("state");

  /**
   * Два пути возврата, и различаются они по самому state.
   *
   * Приложение кладёт состояние внутрь него, зашифрованным. Браузер шлёт
   * случайную строку, а состояние держит в cookie. Расшифровать удаётся
   * только первое, поэтому проверяем его первым: успех означает, что вход
   * начался в приложении, неудача — что это обычная вкладка.
   *
   * Порядок именно такой, а не «сначала cookie»: на телефоне человек мог
   * заходить на сайт и браузером, и тогда в браузере лежит чужая метка от
   * прошлого входа, которая ни к какому из наших state не подойдёт.
   */
  const fromApp = await unpackState(state);

  let codeVerifier: string;
  if (fromApp) {
    if (fromApp.provider !== provider) return fail("state");
    codeVerifier = fromApp.codeVerifier;
  } else {
    if (!cookieState) return fail("state");
    let saved: { provider: string; state: string; codeVerifier: string };
    try {
      saved = JSON.parse(cookieState);
    } catch {
      return fail("state");
    }
    if (saved.provider !== provider || saved.state !== state) return fail("state");
    codeVerifier = saved.codeVerifier;
  }

  try {
    const accessToken = await exchangeCode({
      id: provider,
      origin: req.nextUrl.origin,
      code,
      codeVerifier,
    });

    const profile = await fetchProfile(provider, accessToken);
    const user = await findOrCreateOAuthUser(provider, profile);

    if (!fromApp) {
      await createSession(user.id);
      return NextResponse.redirect(new URL("/", req.url));
    }

    /**
     * Вход начался в приложении, а закончился здесь, в браузере телефона.
     * Сессию тут выдавать бессмысленно — она осталась бы в браузере, а
     * человек ждёт её в приложении. Поэтому привязываем его к коду пары:
     * приложение опрашивает status и заберёт сессию себе.
     *
     * Условие userId: null защищает от повторного захода по той же ссылке:
     * второй раз код уже занят и ничего не перепривяжет.
     */
    const bound = await prisma.loginCode.updateMany({
      where: {
        code: fromApp.pair,
        userId: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { userId: user.id },
    });

    const locale = hasLocale(routing.locales, fromApp.locale)
      ? fromApp.locale
      : routing.defaultLocale;

    if (bound.count === 0) {
      return NextResponse.redirect(
        new URL(localePath(locale, "/login?error=expired"), req.url)
      );
    }

    return NextResponse.redirect(
      new URL(localePath(locale, "/login/done"), req.url)
    );
  } catch (err) {
    console.error(`oauth ${provider} callback error`, err);
    return fail("oauth");
  }
}
