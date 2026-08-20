"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";
import { LangSwitch } from "./LangSwitch";
import { AuthButton } from "./AuthButton";

export function Header() {
  const t = useTranslations();
  const pathname = usePathname();
  const user = useSession();

  const nav = [
    { href: "/", label: t("nav.listings") },
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/my", label: t("nav.myListings") },
  ] as const;

  return (
    <header className="sticky top-0 z-30 bg-ink">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 md:h-[74px] md:gap-7 md:px-8">
        <Link
          href="/"
          className="font-serif text-xl font-semibold tracking-wide text-cream md:text-2xl"
        >
          {t("common.appName")}
        </Link>

        <div className="flex items-center gap-2 rounded-full border border-cream/15 bg-cream/8 px-3 py-1.5">
          <span className="text-[13px] font-semibold text-cream">
            {t("common.moscow")}
          </span>
          <span className="text-xs text-fern">→</span>
          <span className="text-[13px] font-semibold text-cream">
            {t("common.baku")}
          </span>
        </div>

        <nav className="ml-2 hidden items-center gap-6 md:flex">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`pb-1 text-[14.5px] transition ${
                  active
                    ? "border-b-2 border-ochre font-semibold text-cream"
                    : "text-sage hover:text-cream"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <LangSwitch />
          <AuthButton />
          {user && (
            <Link
              href="/new"
              className="hidden rounded-lg bg-ochre px-4 py-2 text-sm font-semibold text-cream transition hover:brightness-110 md:block"
            >
              {t("nav.postListing")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
