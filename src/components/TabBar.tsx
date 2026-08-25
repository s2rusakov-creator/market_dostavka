"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";

const ITEMS = [
  { href: "/", key: "listings", icon: "M3 6h18M3 12h18M3 18h12" },
  { href: "/my", key: "my", icon: "M4 4h16v6H4zM4 14h16v6H4z" },
  { href: "/chats", key: "chats", icon: "M4 5h16v11H8l-4 3z" },
  { href: "/profile", key: "profile", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6" },
] as const;

export function TabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const user = useSession();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-cream pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex items-stretch">
        {ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              // Гостя ведём на вход, но помним, куда он метил: после входа
              // вернём именно туда, а не на главную.
              href={
                user || item.href === "/"
                  ? item.href
                  : (`/login?next=${encodeURIComponent(item.href)}` as never)
              }
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
                active ? "font-semibold text-ink" : "text-stone"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d={item.icon} />
              </svg>
              {t(item.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
