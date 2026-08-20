import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <h1 className="font-serif text-3xl font-semibold text-ink">
        {t("howItWorks.title")}
      </h1>

      <ol className="mt-6 flex flex-col gap-4">
        {["step1", "step2", "step3"].map((step, i) => (
          <li
            key={step}
            className="flex gap-4 rounded-xl bg-cream p-5 ring-1 ring-ink/8"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[14px] font-semibold text-cream">
              {i + 1}
            </span>
            <p className="text-[15px] leading-relaxed text-slate">
              {t(`howItWorks.${step}` as "howItWorks.step1")}
            </p>
          </li>
        ))}
      </ol>

      <section className="mt-6 rounded-xl bg-pine/8 p-5 ring-1 ring-pine/15">
        <h2 className="text-[16px] font-semibold text-ink">
          {t("howItWorks.contactsHidden")}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate">
          {t("howItWorks.contactsHiddenText")}
        </p>
      </section>

      <Link
        href="/terms"
        className="mt-6 inline-block text-[14px] font-semibold text-moss underline underline-offset-4"
      >
        {t("terms.title")}
      </Link>
    </div>
  );
}
