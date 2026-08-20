import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "terms" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <h1 className="font-serif text-3xl font-semibold text-ink">
        {t("title")}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-slate">{t("intro")}</p>

      <section className="mt-8 rounded-xl bg-danger/8 p-5 ring-1 ring-danger/20">
        <h2 className="text-[16px] font-semibold text-danger">
          {t("prohibitedTitle")}
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-ink/80">
          {["1", "2", "3", "4", "5", "6"].map((n) => (
            <li key={n}>{t(`prohibited${n}` as "prohibited1")}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl bg-cream p-5 ring-1 ring-ink/8">
        <h2 className="text-[16px] font-semibold text-ink">
          {t("safetyTitle")}
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-[14px] leading-relaxed text-slate">
          {["1", "2", "3"].map((n) => (
            <li key={n}>{t(`safety${n}` as "safety1")}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-[16px] font-semibold text-ink">
          {t("reportTitle")}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate">
          {t("reportText")}
        </p>
      </section>
    </div>
  );
}
