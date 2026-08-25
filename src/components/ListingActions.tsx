"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export type Responder = { id: string; name: string };

/**
 * Отправитель закрывает свою заявку сам: доставлено либо снято с публикации.
 *
 * Когда откликнувшихся несколько, сначала спрашиваем, кто именно привёз:
 * доставка засчитывается конкретному человеку и влияет на его карточку,
 * поэтому гадать нельзя.
 */
export function ListingActions({
  id,
  status,
  responders,
}: {
  id: string;
  status: string;
  responders: Responder[];
}) {
  const t = useTranslations("listing");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);

  /**
   * Закрытыми считаются только доставленные и снятые. Просроченную заявку
   * закрыть можно и нужно: посылку часто везут в последний день, а срок к
   * тому времени уже вышел. Раньше кнопки просто исчезали — и сделка
   * оставалась без засчитанной доставки, без отправления и без отзывов
   * у обеих сторон, хотя серверная функция закрытия такую заявку принимает.
   */
  if (status === "DONE" || status === "CANCELLED") return null;

  /** Снимать с публикации просроченную незачем — она и так не в ленте. */
  const можноСнять = status !== "EXPIRED";

  async function close(next: "DONE" | "CANCELLED", travelerId?: string) {
    setBusy(true);
    const res = await fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, travelerId }),
    });
    setBusy(false);

    if (res.ok) {
      setChoosing(false);
      router.refresh();
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error === "CHOOSE_TRAVELER") setChoosing(true);
  }

  if (choosing) {
    return (
      <div className="flex w-full flex-col gap-2 rounded-lg bg-white/60 p-3 ring-1 ring-ink/8">
        <p className="text-[13px] font-semibold text-ink">{t("whoDelivered")}</p>
        {responders.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={busy}
            onClick={() => close("DONE", r.id)}
            className="rounded-md border border-ink/12 px-3 py-2 text-left text-[13.5px] text-ink transition hover:border-pine disabled:opacity-60"
          >
            {r.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setChoosing(false)}
          className="self-start px-1 text-[13px] text-slate hover:text-ink"
        >
          {t("cancelChoice")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          responders.length > 1 ? setChoosing(true) : close("DONE")
        }
        className="rounded-lg bg-pine px-3 py-1.5 text-[13px] font-semibold text-cream transition hover:bg-ink disabled:opacity-60"
      >
        {t("markDone")}
      </button>
      {можноСнять && (
        <button
          type="button"
          disabled={busy}
          onClick={() => close("CANCELLED")}
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate transition hover:text-danger disabled:opacity-60"
        >
          {t("cancelListing")}
        </button>
      )}
    </div>
  );
}
