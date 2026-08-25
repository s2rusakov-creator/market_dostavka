import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

/**
 * Страница «вернитесь в приложение».
 *
 * Открывается в браузере телефона — там, где закончился вход через
 * провайдера. Сессию тут не выдают: она нужна в приложении, а не в браузере,
 * и приложение забирает её само, опрашивая status. Поэтому здесь нет ни
 * кнопок, ни ссылок обратно: нажимать нечего, всё уже произошло.
 */
export default async function LoginDonePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-xl bg-cream p-6 text-center ring-1 ring-ink/8">
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pine/10 text-[22px]"
          aria-hidden
        >
          ✓
        </div>
        <h1 className="mt-4 font-serif text-2xl font-semibold text-ink">
          {t("doneTitle")}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate">
          {t("doneText")}
        </p>
      </div>
    </div>
  );
}
