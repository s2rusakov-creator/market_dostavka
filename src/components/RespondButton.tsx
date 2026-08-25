"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";

/**
 * Сообщение под кнопкой по коду ошибки от сервера.
 *
 * Раньше на любую неудачу здесь показывался один восклицательный знак. Под
 * ним пряталось всё подряд, и чаще всего — истёкшая сессия: человек видел «!»
 * и не догадывался, что нужно просто войти заново.
 */
const ПРИЧИНЫ: Record<string, string> = {
  UNAUTHORIZED: "respondUnauthorized",
  NOT_ACTIVE: "respondNotActive",
  OWN_LISTING: "respondOwn",
  NOT_FOUND: "respondGone",
};

export function RespondButton({
  listingId,
  isOwn,
  status,
  hasResponded,
  respondedThreadId,
}: {
  listingId: string;
  isOwn: boolean;
  status: string;
  /** Откликался ли этот человек. Переписка может остаться и после отзыва. */
  hasResponded: boolean;
  respondedThreadId: string | null;
}) {
  const t = useTranslations("listing");
  const router = useRouter();
  const user = useSession();
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOwn) {
    return (
      <span className="rounded-lg bg-ink/6 px-4 py-2.5 text-sm font-semibold text-slate">
        {t("ownListing")}
      </span>
    );
  }

  if (status !== "ACTIVE") {
    return (
      <span className="rounded-lg bg-ink/6 px-4 py-2.5 text-sm font-semibold text-slate">
        {t(`status${status}` as "statusDONE")}
      </span>
    );
  }

  async function withdraw() {
    setWithdrawing(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/respond`, {
      method: "DELETE",
    });
    setWithdrawing(false);

    if (!res.ok) {
      setError(t("withdrawFailed"));
      return;
    }
    router.refresh();
  }

  if (hasResponded) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!respondedThreadId}
          onClick={() =>
            respondedThreadId && router.push(`/chats/${respondedThreadId}`)
          }
          className="rounded-lg border border-pine/30 px-4 py-2.5 text-sm font-semibold text-pine transition hover:bg-pine/8 disabled:opacity-60"
        >
          {t("responded")}
        </button>
        {/*
          Отклик перестал быть необратимым: промах по кнопке уводил чужому
          человеку уведомление и оставлял переписку, которую нельзя было убрать.
        */}
        <button
          type="button"
          onClick={withdraw}
          disabled={withdrawing}
          className="rounded-lg px-2 py-2.5 text-[13px] font-medium text-slate transition hover:text-danger disabled:opacity-60"
        >
          {withdrawing ? t("withdrawing") : t("withdraw")}
        </button>
        {error && <span className="text-[12.5px] text-danger">{error}</span>}
      </div>
    );
  }

  async function respond() {
    if (!user) {
      // Возвращаем человека туда, откуда он ушёл: иначе после входа он
      // оказывался на главной и искал заявку заново.
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);

    if (!res.ok) {
      const данные = (await res.json().catch(() => ({}))) as { error?: string };
      const ключ = данные.error ? ПРИЧИНЫ[данные.error] : undefined;
      setError(t((ключ ?? "respondFailed") as "respondFailed"));
      // Заявку закрыли или удалили, пока человек смотрел на неё, — обновляем
      // страницу, чтобы кнопка не звала во второй раз.
      if (данные.error === "NOT_ACTIVE" || данные.error === "NOT_FOUND") {
        router.refresh();
      }
      return;
    }
    const data = (await res.json()) as { threadId: string };
    router.push(`/chats/${data.threadId}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={respond}
        disabled={busy}
        className="rounded-lg bg-pine px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-ink disabled:opacity-60"
      >
        {t("offerDelivery")}
      </button>
      {error && <span className="text-[12.5px] text-danger">{error}</span>}
    </div>
  );
}
