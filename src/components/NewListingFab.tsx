"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";

/** Мобильная кнопка «разместить» — в шапке для неё нет места. */
export function NewListingFab() {
  const t = useTranslations("nav");
  const user = useSession();

  return (
    <Link
      href={user ? "/new" : "/login"}
      className="fixed bottom-[84px] right-4 z-20 rounded-full bg-ochre px-5 py-3 text-sm font-semibold text-cream shadow-lg shadow-ink/25 md:hidden"
    >
      {t("postListing")}
    </Link>
  );
}
