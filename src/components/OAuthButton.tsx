"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/nextPath";
import { closeExternal, isInsideApp, openExternal } from "@/lib/nativeBridge";

type Phase = "idle" | "waiting" | "expired" | "error";

const POLL_MS = 2000;

/**
 * Кнопка входа через внешнего провайдера.
 *
 * В браузере это обычная ссылка: ушли к провайдеру, вернулись в ту же
 * вкладку с сессией. Внутри приложения так нельзя — и не по нашей прихоти.
 * Google намеренно отклоняет вход из встроенного веб-вью: человек должен
 * видеть настоящую адресную строку, иначе окно входа ничего не стоит
 * подделать. Значит, окно провайдера открывается в браузере телефона.
 *
 * А у браузера своё хранилище cookie. Сессия, выданная там, приложению не
 * достанется — раньше именно так и выходило: на сайте вошёл, в приложении
 * по-прежнему гость.
 *
 * Поэтому здесь тот же приём, что и во входе через Telegram: сервер выдаёт
 * код пары, браузер привязывает к нему человека, а приложение тем временем
 * опрашивает свой же API и забирает сессию себе.
 */
export function OAuthButton({
  id,
  label,
  children,
}: {
  id: "google" | "mailru";
  label: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>("idle");

  /** Код текущей попытки. Пусто — значит опрашивать нечего. */
  const pairRef = useRef<string | null>(null);
  /** Открывали ли окно через мост: только такое можно закрыть обратно. */
  const openedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pairRef.current = null;
  }, []);

  const check = useCallback(async () => {
    const pair = pairRef.current;
    if (!pair) return;

    try {
      const res = await fetch(
        `/api/auth/link/status?code=${encodeURIComponent(pair)}`,
        { cache: "no-store" }
      );
      const status = (await res.json()) as { status: string };

      if (status.status === "ok") {
        const opened = openedRef.current;
        stop();
        if (opened) void closeExternal();
        router.push((safeNextPath(searchParams.get("next")) ?? "/") as never);
        router.refresh();
      } else if (status.status === "expired") {
        stop();
        setPhase("expired");
      }
    } catch {
      // Сеть моргнула — ждём следующего тика.
    }
  }, [router, searchParams, stop]);

  useEffect(() => stop, [stop]);

  /**
   * Пока сверху открыт браузер, приложение свёрнуто, и Android вправе
   * придержать наши таймеры. Возвращение на экран — самый верный момент
   * спросить ещё раз, не дожидаясь очередного тика.
   */
  useEffect(() => {
    if (phase !== "waiting") return;

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase, check]);

  async function start(event: React.MouseEvent<HTMLAnchorElement>) {
    // В браузере не мешаем: обычная ссылка отработает сама.
    if (!isInsideApp()) return;
    event.preventDefault();
    if (phase === "waiting") return;

    setPhase("waiting");
    stop();

    const res = await fetch(`/api/auth/oauth/${id}/app`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    }).catch(() => null);

    if (!res || !res.ok) {
      setPhase("error");
      return;
    }

    const data = (await res.json()) as { code: string; url: string };
    pairRef.current = data.code;

    // Если моста нет, уходим обычным переходом: оболочка всё равно выпустит
    // чужой адрес наружу, просто закрыть окно потом будет некому.
    openedRef.current = await openExternal(data.url);
    if (!openedRef.current) window.location.assign(data.url);

    timerRef.current = setInterval(() => void check(), POLL_MS);
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href={`/api/auth/oauth/${id}/start`}
        onClick={start}
        aria-disabled={phase === "waiting"}
        className="flex items-center justify-center gap-2.5 rounded-lg border border-ink/15 bg-white/70 px-5 py-3 text-[15px] font-semibold text-ink transition hover:border-ink/30 aria-disabled:opacity-60"
      >
        {children}
        {phase === "waiting" ? t("waiting") : t("continueWith", { provider: label })}
      </a>

      {phase === "waiting" && (
        <p className="text-center text-[13px] leading-relaxed text-slate">
          {t("browserHint")}
        </p>
      )}
      {phase === "expired" && (
        <p className="text-center text-[13px] text-danger">{t("linkExpired")}</p>
      )}
      {phase === "error" && (
        <p className="text-center text-[13px] text-danger">{t("startFailed")}</p>
      )}
    </div>
  );
}
