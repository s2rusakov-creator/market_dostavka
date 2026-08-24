/**
 * Service worker: иконка на экране, запуск без адресной строки и кеш ленты.
 *
 * Что кешируем и почему именно так:
 *
 *   - Статика Next (/_next/static/**) — из кеша сразу. Имена файлов содержат
 *     хеш содержимого, поэтому устаревшего варианта не бывает: изменился
 *     файл — изменилось имя.
 *   - Иконки и манифест — тоже из кеша.
 *   - Страницы — сначала сеть, при неудаче кеш. Так человек всегда видит
 *     свежую ленту, а без интернета — ту, что видел в прошлый раз.
 *   - /api/** — только сеть, никогда не кеш. Переписка и сессия обязаны быть
 *     настоящими: показать вчерашний ответ собеседника хуже, чем не показать
 *     ничего.
 *
 * Про приватность. В кеше страниц лежит разметка, отрисованная для вошедшего
 * человека: его заявки, его кнопки. Устройство личное, но после выхода из
 * аккаунта эти следы оставаться не должны — поэтому выход шлёт сюда сообщение
 * ОЧИСТИТЬ, и кеш страниц сносится целиком.
 */

const VERSION = "v1";
const STATIC_CACHE = `yol-static-${VERSION}`;
const PAGES_CACHE = `yol-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

/** Что кладём в кеш сразу при установке — без этого офлайн не с чего начать. */
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icon-192.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Не ждём закрытия старых вкладок: обновление должно доезжать сразу.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Выход из аккаунта: следы прошлого пользователя из кеша страниц убираем. */
self.addEventListener("message", (event) => {
  if (event.data === "ОЧИСТИТЬ") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icon") ||
  url.pathname === "/favicon.png" ||
  url.pathname === "/manifest.webmanifest";

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Кешировать можно только обычные чтения. POST отклика или сообщения обязан
  // дойти до сервера или честно не дойти.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Чужие домены — фотографии в хранилище, шрифты — не наше дело.
  if (url.origin !== self.location.origin) return;

  // Живые данные мимо кеша.
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Переходы по страницам: свежее по возможности, кеш как запасной вариант.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});
