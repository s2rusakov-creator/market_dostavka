"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * Оценка после завершённой сделки.
 *
 * Показывается там же, где человек видит закрытую заявку, — момент, когда он
 * ещё помнит, как всё прошло. Комментарий необязателен: чем меньше просят,
 * тем чаще отвечают, а для рейтинга достаточно звёзд.
 */
export function ReviewForm({
  listingId,
  targetName,
  compact = false,
}: {
  listingId: string;
  targetName: string;
  compact?: boolean;
}) {
  const t = useTranslations("listing");
  const router = useRouter();

  const [open, setOpen] = useState(!compact);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="text-[13px] text-moss">{t("rateThanks")}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ink/15 px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:border-pine"
      >
        {t("rateSubmit")}
      </button>
    );
  }

  async function submit() {
    if (rating === 0) return;
    setBusy(true);

    const res = await fetch(`/api/listings/${listingId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, text: text.trim() || undefined }),
    });
    setBusy(false);

    if (res.ok) {
      setDone(true);
      router.refresh();
    }
  }

  const shown = hovered || rating;

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-white/60 p-3 ring-1 ring-ink/8">
      <p className="text-[13px] font-semibold text-ink">
        {t("rateTitle", { name: targetName })}
      </p>

      <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            aria-label={String(star)}
            className={`text-[22px] leading-none transition ${
              star <= shown ? "text-ochre" : "text-ink/20"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={t("rateComment")}
        className="w-full resize-none rounded-md border border-ink/12 bg-white/70 p-2 text-[13.5px] outline-none focus:border-pine"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || rating === 0}
          className="rounded-lg bg-pine px-3 py-1.5 text-[13px] font-semibold text-cream transition hover:bg-ink disabled:opacity-50"
        >
          {t("rateSubmit")}
        </button>
        {compact && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-1 text-[13px] text-slate hover:text-ink"
          >
            {t("rateLater")}
          </button>
        )}
      </div>
    </div>
  );
}
