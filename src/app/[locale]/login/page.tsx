import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { botUsername } from "@/lib/env";
import { TelegramDeepLogin } from "@/components/TelegramDeepLogin";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { DevLogin } from "@/components/DevLogin";
import { localePath, type Locale } from "@/i18n/routing";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user) redirect(localePath(locale, "/"));

  const t = await getTranslations({ locale, namespace: "auth" });
  const devLoginAllowed =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "1";

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-xl bg-cream p-6 ring-1 ring-ink/8">
        <h1 className="font-serif text-2xl font-semibold text-ink">
          {t("signIn")}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate">
          {t("signInPrompt")}
        </p>

        {botUsername ? (
          <div className="mt-5 flex flex-col gap-5">
            {/* Основной путь: ссылка tg:// открывает установленное приложение
                и не зависит от доступности сайтов Telegram. */}
            <TelegramDeepLogin />

            {/* Запасной: официальный виджет. Он грузится с telegram.org,
                поэтому у части пользователей не появится вовсе — тогда
                на его месте просто ничего не отрисуется. */}
            <div className="border-t border-ink/10 pt-4">
              <p className="mb-2 text-center text-[12px] text-stone">
                {t("widgetFallback")}
              </p>
              <TelegramLoginButton botUsername={botUsername} size="medium" />
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-lg bg-ochre/10 p-3 text-[13px] text-ochre">
            {t("widgetUnavailable")}
          </p>
        )}

        {devLoginAllowed && <DevLogin />}
      </div>
    </div>
  );
}
