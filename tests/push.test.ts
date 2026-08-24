import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { forgetAccessToken, isPushConfigured, sendPush } from "@/lib/push";

/**
 * Тесты отправки в FCM.
 *
 * Подпись служебного токена настоящая — ключ генерируется тут же, — чтобы
 * проверялся реальный путь через jose, а не заглушка вместо него. Подменена
 * только сеть: наружу тесты не ходят.
 */

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const TOKEN_URL = "https://oauth2.googleapis.com/token";

let fetchMock: ReturnType<typeof vi.fn>;
const original = { ...process.env };

/** Ответ на запрос служебного токена. Остальное решает тест. */
function authOk() {
  return new Response(JSON.stringify({ access_token: "служебный-токен" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(sendResponses: Response[] | ((url: string) => Response)) {
  const queue = Array.isArray(sendResponses) ? [...sendResponses] : null;

  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === TOKEN_URL) return authOk();
    if (queue) return queue.shift() ?? new Response("", { status: 200 });
    return (sendResponses as (u: string) => Response)(url);
  });

  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  forgetAccessToken();
  process.env.FCM_PROJECT_ID = "yol-test";
  process.env.FCM_CLIENT_EMAIL = "робот@yol-test.iam.gserviceaccount.com";
  // В переменных окружения перевод строки хранится экранированным — проверяем
  // заодно, что он разворачивается обратно.
  process.env.FCM_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...original };
});

describe("настройка", () => {
  it("без переменных пуши считаются ненастроенными", () => {
    delete process.env.FCM_PROJECT_ID;
    expect(isPushConfigured()).toBe(false);
  });

  it("ненастроенная отправка молча возвращает ноль", async () => {
    delete process.env.FCM_PRIVATE_KEY;
    setup([]);

    expect(await sendPush(["т"], { title: "т", body: "т", path: "/" })).toEqual({
      sent: 0,
      dead: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("пустой список устройств не поднимает даже токен", async () => {
    setup([]);
    expect(await sendPush([], { title: "т", body: "т", path: "/" })).toEqual({
      sent: 0,
      dead: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("что уходит в FCM", () => {
  it("собирает сообщение с заголовком, текстом и путём", async () => {
    setup([new Response("{}", { status: 200 })]);

    await sendPush(["токен-телефона"], {
      title: "Рустам А.",
      body: "Лечу 26-го",
      path: "/chats/поток-1",
      badge: 3,
    });

    const send = fetchMock.mock.calls.find(([u]) => String(u).includes("messages:send"))!;
    const payload = JSON.parse(String((send[1] as RequestInit).body));

    expect(payload.message.token).toBe("токен-телефона");
    expect(payload.message.notification).toEqual({
      title: "Рустам А.",
      body: "Лечу 26-го",
    });
    // Оболочке нужен путь, чтобы открыть нужный чат, а не главную.
    expect(payload.message.data.path).toBe("/chats/поток-1");
    // В data допустимы только строки — так требует FCM.
    expect(payload.message.data.badge).toBe("3");
    expect(payload.message.android.notification.notificationCount).toBe(3);
    expect(payload.message.android.priority).toBe("HIGH");
  });

  it("без счётчика непрочитанных значок не трогаем", async () => {
    setup([new Response("{}", { status: 200 })]);

    await sendPush(["т"], { title: "т", body: "т", path: "/" });

    const send = fetchMock.mock.calls.find(([u]) => String(u).includes("messages:send"))!;
    const payload = JSON.parse(String((send[1] as RequestInit).body));
    expect(payload.message.data.badge).toBeUndefined();
    expect(payload.message.android.notification.notificationCount).toBeUndefined();
  });

  it("шлёт на все устройства человека", async () => {
    setup(() => new Response("{}", { status: 200 }));

    const result = await sendPush(["телефон", "планшет"], {
      title: "т",
      body: "т",
      path: "/",
    });

    expect(result.sent).toBe(2);
    const sends = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes("messages:send")
    );
    expect(sends).toHaveLength(2);
  });

  it("служебный токен берётся один раз на несколько сообщений", async () => {
    setup(() => new Response("{}", { status: 200 }));

    await sendPush(["один"], { title: "т", body: "т", path: "/" });
    await sendPush(["два"], { title: "т", body: "т", path: "/" });

    const auths = fetchMock.mock.calls.filter(([u]) => String(u) === TOKEN_URL);
    // Обмен ключа на токен — лишний круг до Google на каждое уведомление.
    expect(auths).toHaveLength(1);
  });
});

describe("мёртвые токены", () => {
  it("UNREGISTERED — приложение удалили, запись бесполезна", async () => {
    setup([
      new Response(JSON.stringify({ error: { status: "UNREGISTERED" } }), {
        status: 404,
      }),
    ]);

    const result = await sendPush(["протухший"], {
      title: "т",
      body: "т",
      path: "/",
    });

    expect(result).toEqual({ sent: 0, dead: ["протухший"] });
  });

  it("INVALID_ARGUMENT — такого токена никогда не было", async () => {
    setup([
      new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }), {
        status: 400,
      }),
    ]);

    const result = await sendPush(["мусор"], { title: "т", body: "т", path: "/" });
    expect(result.dead).toEqual(["мусор"]);
  });

  it("сбой на стороне Google мёртвым токеном не считается", async () => {
    setup([new Response("что-то сломалось", { status: 500 })]);

    const result = await sendPush(["живой"], { title: "т", body: "т", path: "/" });
    // Удалить рабочее устройство из-за пятиминутной аварии было бы хуже,
    // чем один раз не доставить уведомление.
    expect(result).toEqual({ sent: 0, dead: [] });
  });

  it("живые и мёртвые в одной отправке разделяются", async () => {
    setup((url) => (url.includes("messages:send") ? new Response("{}") : authOk()));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === TOKEN_URL) return authOk();
      const body = JSON.parse(String(init?.body));
      return body.message.token === "мёртвый"
        ? new Response(JSON.stringify({ error: { status: "UNREGISTERED" } }), { status: 404 })
        : new Response("{}", { status: 200 });
    });

    const result = await sendPush(["живой", "мёртвый"], {
      title: "т",
      body: "т",
      path: "/",
    });

    expect(result.sent).toBe(1);
    expect(result.dead).toEqual(["мёртвый"]);
  });
});

describe("сеть подвела", () => {
  it("обрыв не роняет отправку", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === TOKEN_URL) return authOk();
        throw new TypeError("сеть недоступна");
      })
    );

    const result = await sendPush(["т"], { title: "т", body: "т", path: "/" });
    expect(result).toEqual({ sent: 0, dead: [] });
  });

  it("не выдали служебный токен — до отправки не доходим", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TOKEN_URL) {
        return new Response("нет доступа", { status: 401 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", mock);

    const result = await sendPush(["т"], { title: "т", body: "т", path: "/" });

    expect(result).toEqual({ sent: 0, dead: [] });
    expect(mock.mock.calls.filter(([u]) => String(u).includes("messages:send"))).toHaveLength(0);
  });
});
