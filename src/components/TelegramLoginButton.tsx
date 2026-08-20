"use client";

import { useEffect, useRef } from "react";

/**
 * Официальный виджет Telegram. Он рендерит iframe сам, поэтому вставляем
 * <script> в пустой контейнер и отдаём ему data-auth-url — колбэк на сервере.
 * Домен сайта должен быть прописан боту через /setdomain у BotFather.
 */
export function TelegramLoginButton({
  botUsername,
  size = "large",
}: {
  botUsername: string;
  size?: "large" | "medium" | "small";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !botUsername) return;

    node.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", size);
    // Скругление делаем сами на обёртке. Если попросить его у виджета, он
    // рисует кнопку меньше своего iframe, и по углам вылезает тёмный фон.
    script.setAttribute("data-radius", "0");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute(
      "data-auth-url",
      // window.location.pathname несёт префикс языка — после входа вернёмся туда же.
      `${window.location.origin}/api/auth/telegram?next=${encodeURIComponent(
        window.location.pathname
      )}`
    );
    node.appendChild(script);

    return () => {
      node.innerHTML = "";
    };
  }, [botUsername, size]);

  return (
    <div className="flex justify-center">
      {/* overflow-hidden обрезает углы iframe — иначе из-под скруглённой
          кнопки виден тёмный фон виджета. [&_iframe]:block убирает зазор
          под строкой, который даёт inline-элемент. */}
      <div
        ref={ref}
        className="min-h-[40px] overflow-hidden rounded-lg [&_iframe]:block"
      />
    </div>
  );
}
