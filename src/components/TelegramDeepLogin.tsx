"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Phase = "idle" | "waiting" | "expired" | "error";

const POLL_MS = 2000;

/**
 * Вход через диплинк бота.
 *
 * Виджет Telegram грузится с telegram.org, а он в России недоступен без VPN —
 * у аудитории кнопка просто не появляется. Здесь сайт выдаёт одноразовый код и
 * открывает ссылку tg://, которую обрабатывает установленное приложение,
 * минуя сайты Telegram. Бот сообщает серверу, что код подтверждён, а страница
 * тем временем опрашивает свой же API и забирает сессию.
 */
export function TelegramDeepLogin() {
  const t = useTranslations("auth");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [links, setLinks] = useState<{ deepLink: string; webLink: string } | null>(
    null
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  async function start() {
    setPhase("waiting");
    stopPolling();

    const res = await fetch("/api/auth/link/start", { method: "POST" });
    if (!res.ok) {
      setPhase("error");
      return;
    }

    const data = (await res.json()) as {
      code: string;
      deepLink: string;
      webLink: string;
    };
    setLinks({ deepLink: data.deepLink, webLink: data.webLink });

    // Открываем приложение. Если схема не поддерживается, пользователь
    // воспользуется запасной ссылкой ниже — поэтому не location.href,
    // который в этом случае показал бы ошибку навигации.
    window.location.assign(data.deepLink);

    timerRef.current = setInterval(async () => {
      try {
        const check = await fetch(
          `/api/auth/link/status?code=${encodeURIComponent(data.code)}`,
          { cache: "no-store" }
        );
        const status = (await check.json()) as { status: string };

        if (status.status === "ok") {
          stopPolling();
          router.push("/");
          router.refresh();
        } else if (status.status === "expired") {
          stopPolling();
          setPhase("expired");
        }
      } catch {
        // Сеть моргнула — ждём следующего тика.
      }
    }, POLL_MS);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={start}
        disabled={phase === "waiting"}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2AABEE] px-5 py-3 text-[15px] font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path d="M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.35-.1-.55-.6-.2L6.2 13.1 1.4 11.6c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z" />
        </svg>
        {phase === "waiting" ? t("waiting") : t("signInVia")}
      </button>

      {phase === "waiting" && links && (
        <div className="text-center">
          <p className="text-[13px] leading-relaxed text-slate">
            {t("waitingHint")}
          </p>
          <a
            href={links.webLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[13px] font-semibold text-moss underline underline-offset-2"
          >
            {t("openInBrowser")}
          </a>
        </div>
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
