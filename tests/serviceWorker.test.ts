import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Тесты service worker'а.
 *
 * Проверяется не пересказ логики, а сам файл public/sw.js — тот, что уедет
 * в прод. Он написан для среды воркера, поэтому здесь ему подставляются
 * поддельные self, caches и fetch, а потом руками разыгрываются события,
 * которые в жизни присылает браузер.
 *
 * Так вышло, потому что в панели предпросмотра регистрация service worker'а
 * недоступна: скрипт отдаётся с правильным типом и кодом 200, но браузер
 * панели отвечает «unknown error occurred when fetching the script».
 * Поведение всё равно нужно проверить, и лучше это делать здесь, чем
 * рассчитывать на ручной прогон.
 */

const ORIGIN = "http://localhost:3000";

type Listener = (event: FakeEvent) => void;

type FakeEvent = {
  type: string;
  request?: unknown;
  data?: unknown;
  waitUntil: (p: Promise<unknown>) => void;
  respondWith: (r: Promise<Response> | Response) => void;
};

/**
 * Ключ кеша. Настоящий caches.match принимает и строку, и запрос, а
 * относительный путь разрешает от области видимости воркера — поэтому
 * "/offline.html" и полный адрес обязаны попадать в одну ячейку.
 */
const cacheKey = (request: { url: string } | string) =>
  new URL(typeof request === "string" ? request : request.url, ORIGIN).toString();

/** Кеш в памяти: ровно те методы, которые использует sw.js. */
class FakeCache {
  store = new Map<string, Response>();

  async match(request: { url: string } | string) {
    return this.store.get(cacheKey(request));
  }

  async put(request: { url: string } | string, response: Response) {
    this.store.set(cacheKey(request), response);
  }

  async addAll(urls: string[]) {
    for (const url of urls) {
      this.store.set(cacheKey(url), new Response(`тело ${url}`));
    }
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();

  async open(name: string) {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.caches.set(name, cache);
    }
    return cache;
  }

  async keys() {
    return [...this.caches.keys()];
  }

  async delete(name: string) {
    return this.caches.delete(name);
  }

  async match(request: { url: string } | string) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** Собирает окружение воркера и выполняет в нём настоящий public/sw.js. */
async function loadWorker(fetchImpl: typeof fetch) {
  const code = await readFile(
    path.join(process.cwd(), "public", "sw.js"),
    "utf8"
  );

  const listeners = new Map<string, Listener>();
  const waited: Promise<unknown>[] = [];

  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };

  const cacheStorage = new FakeCacheStorage();

  const factory = new Function("self", "caches", "fetch", code);
  factory(self, cacheStorage, fetchImpl);

  /** Разыгрывает событие и дожидается всего, что воркер попросил подождать. */
  async function dispatch(
    type: string,
    init: { request?: unknown; data?: unknown } = {}
  ): Promise<Response | undefined> {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`нет обработчика ${type}`);

    let answered: Promise<Response> | Response | undefined;
    const event: FakeEvent = {
      type,
      ...init,
      waitUntil: (p) => void waited.push(p),
      respondWith: (r) => {
        answered = r;
      },
    };

    listener(event);
    await Promise.all(waited.splice(0));
    return answered ? await answered : undefined;
  }

  return { dispatch, cacheStorage, self };
}

/**
 * Двойник запроса.
 *
 * Настоящий Request с mode: "navigate" в Node не собрать — по спецификации
 * такие запросы создаёт только сам браузер при переходе по ссылке. А ровно
 * этот режим и отличает переход по странице от загрузки картинки, то есть
 * решает, какую стратегию выберет воркер. Поэтому подставляем объект с теми
 * тремя полями, которые sw.js действительно читает.
 */
type FakeRequest = { url: string; method: string; mode: string };

const navigation = (url: string): FakeRequest => ({
  url: new URL(url, ORIGIN).toString(),
  method: "GET",
  mode: "navigate",
});

const plain = (url: string, init?: { method?: string }): FakeRequest => ({
  url: new URL(url, ORIGIN).toString(),
  method: init?.method ?? "GET",
  mode: "cors",
});

const external = (url: string): FakeRequest => ({
  url,
  method: "GET",
  mode: "cors",
});

let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  network = vi.fn(async (request: { url: string } | string) => {
    const url = typeof request === "string" ? request : request.url;
    return new Response(`из сети: ${url}`, { status: 200 });
  });
});

describe("установка и обновление", () => {
  it("кладёт в кеш офлайн-страницу и иконки", async () => {
    const { dispatch, cacheStorage } = await loadWorker(
      network as unknown as typeof fetch
    );
    await dispatch("install");

    const cached = await cacheStorage.match(`${ORIGIN}/offline.html`);
    expect(cached).toBeDefined();
    expect(await cacheStorage.match(`${ORIGIN}/icon-192.png`)).toBeDefined();
  });

  it("при активации сносит кеши прошлых версий", async () => {
    const { dispatch, cacheStorage } = await loadWorker(
      network as unknown as typeof fetch
    );
    await cacheStorage.open("yol-static-v0");
    await cacheStorage.open("yol-pages-v0");
    await dispatch("install");

    await dispatch("activate");

    const left = await cacheStorage.keys();
    expect(left.some((k) => k.endsWith("-v0"))).toBe(false);
    expect(left.some((k) => k.includes("static"))).toBe(true);
  });
});

describe("что воркер вообще берёт на себя", () => {
  it("не вмешивается в отправку сообщения и отклика", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);

    const answer = await dispatch("fetch", {
      request: plain("/api/threads/abc/messages", { method: "POST" }),
    });
    expect(answer).toBeUndefined();
  });

  it("не трогает живые данные даже на чтение", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);

    const answer = await dispatch("fetch", {
      request: plain("/api/threads/abc/messages"),
    });
    // Показать вчерашний ответ собеседника хуже, чем не показать ничего.
    expect(answer).toBeUndefined();
    expect(network).not.toHaveBeenCalled();
  });

  it("не трогает чужие домены — фото в хранилище и шрифты", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);

    const answer = await dispatch("fetch", {
      request: external("https://example.supabase.co/photo.webp"),
    });
    expect(answer).toBeUndefined();
  });

  it("обычную картинку с чужого пути не перехватывает", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);

    // Не навигация и не статика Next — значит мимо.
    const answer = await dispatch("fetch", { request: plain("/uploads/a.webp") });
    expect(answer).toBeUndefined();
  });
});

describe("статика Next", () => {
  it("первый раз идёт в сеть, второй — из кеша", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);
    const request = plain("/_next/static/chunks/main.js");

    const first = await dispatch("fetch", { request });
    expect(await first!.text()).toContain("из сети");
    expect(network).toHaveBeenCalledTimes(1);

    const second = await dispatch("fetch", { request });
    expect(await second!.text()).toContain("из сети");
    // Имена файлов Next содержат хеш содержимого, поэтому устаревшего
    // варианта не бывает и второй раз в сеть ходить незачем.
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("иконки и манифест тоже кешируются", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);

    await dispatch("fetch", { request: plain("/manifest.webmanifest") });
    await dispatch("fetch", { request: plain("/manifest.webmanifest") });
    expect(network).toHaveBeenCalledTimes(1);
  });
});

describe("страницы", () => {
  it("свежее из сети, а копия остаётся в кеше", async () => {
    const { dispatch, cacheStorage } = await loadWorker(
      network as unknown as typeof fetch
    );

    const answer = await dispatch("fetch", { request: navigation("/") });
    expect(await answer!.text()).toContain("из сети");
    expect(await cacheStorage.match(`${ORIGIN}/`)).toBeDefined();
  });

  it("без сети показывает последнюю виденную ленту", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);

    await dispatch("fetch", { request: navigation("/") });

    network.mockRejectedValue(new TypeError("сети нет"));
    const offline = await dispatch("fetch", { request: navigation("/") });

    expect(await offline!.text()).toContain("из сети: http://localhost:3000/");
  });

  it("без сети и без кеша показывает заглушку, а не ошибку", async () => {
    const { dispatch } = await loadWorker(network as unknown as typeof fetch);
    await dispatch("install");

    network.mockRejectedValue(new TypeError("сети нет"));
    const answer = await dispatch("fetch", { request: navigation("/chats") });

    expect(await answer!.text()).toContain("offline.html");
  });

  it("неудачный ответ сервера в кеш не попадает", async () => {
    const { dispatch, cacheStorage } = await loadWorker(
      network as unknown as typeof fetch
    );
    network.mockResolvedValue(new Response("нет такой страницы", { status: 404 }));

    await dispatch("fetch", { request: navigation("/нет-такой") });

    expect(await cacheStorage.match(`${ORIGIN}/нет-такой`)).toBeUndefined();
  });
});

describe("выход из аккаунта", () => {
  it("сносит кеш страниц и не трогает статику", async () => {
    const { dispatch, cacheStorage } = await loadWorker(
      network as unknown as typeof fetch
    );
    await dispatch("install");
    await dispatch("fetch", { request: navigation("/my") });
    expect(await cacheStorage.match(`${ORIGIN}/my`)).toBeDefined();

    await dispatch("message", { data: "ОЧИСТИТЬ" });

    // Разметка, отрисованная для прошлого пользователя, ушла.
    expect(await cacheStorage.match(`${ORIGIN}/my`)).toBeUndefined();
    // Офлайн-страница — не личные данные, её сохраняем.
    expect(await cacheStorage.match(`${ORIGIN}/offline.html`)).toBeDefined();
  });

  it("на посторонние сообщения не реагирует", async () => {
    const { dispatch, cacheStorage } = await loadWorker(
      network as unknown as typeof fetch
    );
    await dispatch("fetch", { request: navigation("/my") });

    await dispatch("message", { data: "что-то другое" });

    expect(await cacheStorage.match(`${ORIGIN}/my`)).toBeDefined();
  });
});
