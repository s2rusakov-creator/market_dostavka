"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "./SessionProvider";

export function ReportButton({
  listingId,
  hidden,
}: {
  listingId: string;
  hidden: boolean;
}) {
  const t = useTranslations("listing");
  const user = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  if (hidden || !user) return null;
  if (sent) return <span className="text-[12px] text-stone">{t("reported")}</span>;

  async function submit() {
    if (reason.trim().length < 3) return;
    await fetch(`/api/listings/${listingId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setSent(true);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[12px] text-stone underline decoration-dotted underline-offset-2 transition hover:text-danger"
      >
        {t("report")}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg bg-cream p-3 shadow-lg ring-1 ring-ink/12">
          <label className="mb-1 block text-[12px] text-slate">
            {t("reportReason")}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-ink/12 bg-white/60 p-2 text-[13px] outline-none focus:border-pine"
          />
          <button
            type="button"
            onClick={submit}
            className="mt-2 w-full rounded-md bg-pine py-1.5 text-[13px] font-semibold text-cream"
          >
            {t("report")}
          </button>
        </div>
      )}
    </div>
  );
}
