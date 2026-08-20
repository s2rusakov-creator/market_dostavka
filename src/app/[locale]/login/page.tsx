import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { botUsername } from "@/lib/env";
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

        <div className="mt-5">
          {botUsername ? (
            <TelegramLoginButton botUsername={botUsername} />
          ) : (
            <p className="rounded-lg bg-ochre/10 p-3 text-[13px] text-ochre">
              {t("widgetUnavailable")}
            </p>
          )}
        </div>

        {devLoginAllowed && <DevLogin />}
      </div>
    </div>
  );
}
