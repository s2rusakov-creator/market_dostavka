"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Показывать ли в пуше имя и текст сообщения.
 *
 * Здесь договариваются о встречах и передают телефоны, а предпросмотр на
 * экране блокировки видит любой, кто рядом. По умолчанию включено — так
 * уведомление полезнее, — но выключить это должно быть можно в одно касание.
 *
 * Настройка сохраняется сразу, без кнопки «применить»: переключатель, который
 * ещё надо подтвердить, люди оставляют неподтверждённым.
 */
export function NotifyPreviewSetting({ initial }: { initial: boolean }) {
  const t = useTranslations("profile");
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setBusy(true);

    const res = await fetch("/api/me/notify-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyPreview: next }),
    }).catch(() => null);

    setBusy(false);
    // Не сохранилось — возвращаем переключатель, чтобы он не врал.
    if (!res?.ok) setEnabled(!next);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[14px] text-ink">{t("notifyPreview")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t("notifyPreview")}
        disabled={busy}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
          enabled ? "bg-pine" : "bg-ink/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream transition-all ${
            enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
