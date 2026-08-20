"use client";

import { useTranslations } from "next-intl";
import { useSound } from "@/lib/useSound";

/** Тот же хук, что и в чате: переключатель сразу проигрывает пробный сигнал. */
export function SoundSetting({ initial }: { initial: boolean }) {
  const t = useTranslations("profile");
  const { enabled, toggle } = useSound(initial);

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[14px] text-ink">{t("sound")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
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
