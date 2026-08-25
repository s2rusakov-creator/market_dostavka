import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { initials, rating } from "@/lib/format";
import { LangSwitch } from "@/components/LangSwitch";
import { SoundSetting } from "@/components/SoundSetting";
import { NotifyPreviewSetting } from "@/components/NotifyPreviewSetting";
import { localePath, type Locale } from "@/i18n/routing";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  // Запоминаем, куда человек шёл: после входа вернём сюда, а не на главную.
  if (!user) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(localePath(locale, "/profile"))}`);

  const t = await getTranslations({ locale });
  const stars = rating(user.ratingSum, user.ratingCount);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="font-serif text-2xl font-semibold text-ink">
        {t("profile.title")}
      </h1>

      <section className="mt-5 flex items-center gap-4 rounded-xl bg-cream p-5 ring-1 ring-ink/8">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ink/8 text-[16px] font-semibold text-ink">
          {initials(user.firstName, user.lastName)}
        </span>
        <div>
          <div className="text-[17px] font-semibold text-ink">
            {user.firstName} {user.lastName ?? ""}
          </div>
          {/*
            Показываем обе роли. Раньше в профиле были только доставки, а на
            карточках в ленте — отправления, и один человек описывался разными
            числами в разных местах.
          */}
          <div className="mt-0.5 text-[13px] text-slate">
            {t("profile.deliveries")}: {user.deliveriesCount} ·{" "}
            {t("profile.sent")}: {user.sentCount} · {t("profile.rating")}:{" "}
            {stars ?? t("profile.noRating")}
          </div>
        </div>
      </section>

      <section className="mt-4 flex flex-col gap-3 rounded-xl bg-cream p-5 ring-1 ring-ink/8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px] text-ink">{t("profile.language")}</span>
          <LangSwitch tone="light" />
        </div>

        <div className="h-px bg-ink/8" />

        <SoundSetting initial={user.soundEnabled} />

        <div className="h-px bg-ink/8" />

        <NotifyPreviewSetting initial={user.notifyPreview} />
      </section>

      <Link
        href="/terms"
        className="mt-5 inline-block text-[14px] font-semibold text-moss underline underline-offset-4"
      >
        {t("terms.title")}
      </Link>
    </div>
  );
}
