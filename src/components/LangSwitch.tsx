"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { useSession } from "./SessionProvider";

export function LangSwitch({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const user = useSession();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });

      // Язык нужен и на сервере — для пушей в Telegram. Но только у тех, кому
      // есть что слать: гостю сохранять нечего, а лишний вызов функции на
      // каждое переключение замедляет и без того небыстрый переход.
      if (user) {
        void fetch("/api/me/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: next }),
        });
      }
    });
  }

  const base =
    tone === "dark"
      ? "border-cream/20 text-sage"
      : "border-ink/15 text-slate";

  return (
    <div
      className={`flex items-center gap-0.5 rounded-full border p-0.5 ${base} ${
        pending ? "opacity-60" : ""
      }`}
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-current={l === locale}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition ${
            l === locale
              ? "bg-cream text-ink"
              : "hover:text-cream/90"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
