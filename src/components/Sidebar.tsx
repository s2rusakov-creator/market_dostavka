import { getTranslations } from "next-intl/server";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function Sidebar({
  locale,
  stats,
}: {
  locale: Locale;
  stats: { active: number; avgPrice: number; newToday: number };
}) {
  const t = await getTranslations({ locale });

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[300px] lg:shrink-0">
      <section className="rounded-xl bg-cream p-4 ring-1 ring-ink/8">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">
          {t("howItWorks.title")}
        </h2>
        <ol className="flex flex-col gap-3">
          {["step1", "step2", "step3"].map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/8 text-[12px] font-semibold text-ink">
                {i + 1}
              </span>
              <p className="text-[13.5px] leading-relaxed text-slate">
                {t(`howItWorks.${step}` as "howItWorks.step1")}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl bg-pine/8 p-4 ring-1 ring-pine/15">
        <h2 className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold text-ink">
          <span aria-hidden>🔒</span>
          {t("howItWorks.contactsHidden")}
        </h2>
        <p className="text-[13px] leading-relaxed text-slate">
          {t("howItWorks.contactsHiddenText")}
        </p>
      </section>

      <section className="rounded-xl bg-cream p-4 ring-1 ring-ink/8">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-stone">
          {t("stats.title")}
        </h2>
        <dl className="flex flex-col gap-2 text-[13.5px]">
          <Row label={t("stats.activeListings")} value={String(stats.active)} />
          <Row
            label={t("stats.avgPrice")}
            value={`${formatPrice(stats.avgPrice, locale)} ${t("common.rub")}`}
          />
          <Row label={t("stats.newToday")} value={String(stats.newToday)} />
        </dl>
      </section>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
