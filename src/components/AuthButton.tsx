"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";
import { initials } from "@/lib/format";
import { clearPageCache } from "./ServiceWorker";

export function AuthButton() {
  const t = useTranslations("auth");
  const user = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <Link
        href="/login"
        // whitespace-nowrap обязателен: по-азербайджански «Daxil ol» — два
        // слова, и в узкой шапке кнопка ломалась на три строки.
        className="shrink-0 whitespace-nowrap rounded-lg border border-cream/25 px-2.5 py-1.5 text-[13px] font-semibold text-cream transition hover:bg-cream/10 md:px-3 md:text-sm"
      >
        {t("signIn")}
      </Link>
    );
  }

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // В кеше service worker'а осталась разметка, отрисованная для этого
    // человека. Устройство личное, но после выхода следов быть не должно.
    await clearPageCache();
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="grid h-8 w-8 place-items-center rounded-full bg-cream/12 text-[11px] font-semibold text-cream"
        title={user.firstName}
      >
        {initials(user.firstName, user.lastName)}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="text-xs text-sage transition hover:text-cream disabled:opacity-50"
      >
        {t("signOut")}
      </button>
    </div>
  );
}
