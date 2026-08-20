"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

const STORAGE_KEY = "yol.sound";
const CHANGE_EVENT = "yol:sound-change";

/**
 * Настройка живёт в localStorage, а не в состоянии React: её читают сразу два
 * независимых компонента (чат и профиль), и переключение в одном должно быть
 * видно в другом. useSyncExternalStore даёт это без общего провайдера и без
 * setState внутри эффекта.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/** На сервере localStorage нет — отдаём null, и берётся значение из профиля. */
function getServerSnapshot(): string | null {
  return null;
}

export function useSound(initialEnabled = true) {
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const enabled = stored === null ? initialEnabled : stored === "1";

  const ctxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // Браузер не даёт играть звук до первого действия пользователя, поэтому
  // «разогреваем» контекст на первом же клике или нажатии клавиши — к приходу
  // ответа он уже разблокирован.
  useEffect(() => {
    const warm = () => ensureContext();
    window.addEventListener("pointerdown", warm, { once: true });
    window.addEventListener("keydown", warm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
  }, [ensureContext]);

  /** Одна нота: синтезируем на месте, звуковой файл не нужен. */
  const beep = useCallback(
    (ctx: AudioContext, freq: number, at: number, dur: number, peak: number) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + at);
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.02);
    },
    []
  );

  const play = useCallback(() => {
    if (!enabled) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") return;
    // Две ноты вверх — заметно, но не раздражает при частых сообщениях.
    beep(ctx, 660, 0, 0.12, 0.16);
    beep(ctx, 880, 0.1, 0.18, 0.16);
  }, [enabled, ensureContext, beep]);

  const toggle = useCallback(() => {
    const next = !enabled;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(CHANGE_EVENT));

    void fetch("/api/me/sound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soundEnabled: next }),
    });

    // Пробный сигнал при включении: человек должен услышать, что именно включил.
    if (next) {
      const ctx = ensureContext();
      if (ctx?.state === "running") beep(ctx, 880, 0, 0.16, 0.12);
    }
  }, [enabled, ensureContext, beep]);

  return { enabled, play, toggle };
}
