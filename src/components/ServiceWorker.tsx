"use client";

import { useEffect } from "react";

/**
 * Регистрация service worker.
 *
 * Только в продакшене. В разработке он мешает: кеширует то, что через секунду
 * пересоберётся, и Fast Refresh начинает показывать вчерашнюю разметку.
 * Проверять офлайн-поведение нужно на собранном приложении — там оно и живёт.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Ждём загрузки: регистрация во время начальной отрисовки отнимает у неё
    // сеть и процессор ровно тогда, когда человек смотрит на пустой экран.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("service worker не зарегистрировался", err);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

/**
 * Просит service worker забыть закешированные страницы.
 *
 * Вызывается при выходе из аккаунта: в кеше лежит разметка, отрисованная для
 * вошедшего человека — его заявки, его кнопки. Устройство личное, но после
 * выхода этих следов оставаться не должно.
 */
export async function clearPageCache(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage("ОЧИСТИТЬ");
  } catch {
    // Service worker не поднялся — чистить нечего.
  }
}
