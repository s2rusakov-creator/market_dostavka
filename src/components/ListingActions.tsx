"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/** Отправитель закрывает свою заявку сам: доставлено либо снято с публикации. */
export function ListingActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("listing");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (status !== "ACTIVE" && status !== "MATCHED") return null;

  async function setStatus(next: "DONE" | "CANCELLED") {
    setBusy(true);
    const res = await fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus("DONE")}
        className="rounded-lg bg-pine px-3 py-1.5 text-[13px] font-semibold text-cream transition hover:bg-ink disabled:opacity-60"
      >
        {t("markDone")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus("CANCELLED")}
        className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate transition hover:text-danger disabled:opacity-60"
      >
        {t("cancelListing")}
      </button>
    </div>
  );
}
