import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { botUsername } from "@/lib/env";
import { TelegramDeepLogin } from "@/components/TelegramDeepLogin";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { OAuthButtons } from "@/components/OAuthButtons";
import { EmailAuthForm } from "@/components/EmailAuthForm";
import { DevLogin } from "@/components/DevLogin";
import { localePath, type Locale } from "@/i18n/routing";
import { safeNextPath } from "@/lib/nextPath";

/** Коды, которые возвращают OAuth-роуты в ?error=. */
const ERROR_KEYS: Record<string, string> = {
  provider: "errOauth",
  state: "errOauth",
  oauth: "errOauth",
  cancelled: "errCancelled",
  telegram: "errOauth",
};

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, { error, next }] = await Promise.all([
    getCurrentUser(),
    searchParams,
  ]);

  // Уже вошедшего отправляем туда, куда он метил, а не на главную: сюда можно
  // попасть по ссылке из старой вкладки, где интерфейс ещё думает, что гость.
  if (user) redirect(safeNextPath(next) ?? localePath(locale, "/"));

  const t = await getTranslations({ locale, namespace: "auth" });

  const devLoginAllowed =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "1";
  const errorKey = error ? ERROR_KEYS[error] : null;

  return (
    <div className="mx-auto max-w-md px-4 py-10 md:py-16">
      <div className="rounded-xl bg-cream p-6 ring-1 ring-ink/8">
        <h1 className="font-serif text-2xl font-semibold text-ink">
          {t("signIn")}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate">
          {t("signInPrompt")}
        </p>

        {errorKey && (
          <p className="mt-4 rounded-lg bg-danger/10 p-3 text-[13px] text-danger">
            {t(errorKey as "errOauth")}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-4">
          {botUsername && <TelegramDeepLogin />}

          <OAuthButtons locale={locale} />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-ink/10" />
            <span className="text-[12px] text-stone">{t("orEmail")}</span>
            <span className="h-px flex-1 bg-ink/10" />
          </div>

          <EmailAuthForm />

          {botUsername && (
            <div className="border-t border-ink/10 pt-4">
              <p className="mb-2 text-center text-[12px] text-stone">
                {t("widgetFallback")}
              </p>
              <TelegramLoginButton botUsername={botUsername} size="medium" />
            </div>
          )}
        </div>

        {devLoginAllowed && <DevLogin />}
      </div>
    </div>
  );
}
