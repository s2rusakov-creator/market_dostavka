"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { CATEGORIES, SORTS } from "@/lib/constants";

export function Filters({ total }: { total: number }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = searchParams.get("category");
  const sort = searchParams.get("sort") ?? "newest";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] font-semibold text-slate">
        {t("feed.activeCount", { count: total })}
      </div>

      <div className="flex items-center gap-3">
        <div className="no-sb -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <Chip
            active={!category}
            onClick={() => setParam("category", null)}
            label={t("feed.all")}
          />
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={category === c}
              onClick={() => setParam("category", c)}
              label={t(`categories.${c}` as "categories.OTHER")}
            />
          ))}
        </div>

        <label className="hidden shrink-0 items-center gap-2 text-[13px] text-stone md:flex">
          {t("feed.sort")}
          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className="rounded-md border border-ink/12 bg-cream px-2 py-1 text-[13px] font-semibold text-ink outline-none"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(
                  `feed.sort${s[0].toUpperCase()}${s.slice(1)}` as "feed.sortNewest"
                )}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition ${
        active
          ? "bg-ink text-cream"
          : "bg-cream text-slate ring-1 ring-ink/10 hover:ring-ink/25"
      }`}
    >
      {label}
    </button>
  );
}
