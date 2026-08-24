import "server-only";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Отправка пушей через FCM HTTP v1.
 *
 * SDK намеренно не используется — по той же причине, что и в storage.ts:
 * нужна ровно одна операция, «отправить сообщение», а у Firebase для неё есть
 * обычный REST. Подписать служебный токен умеет jose, который уже стоит ради
 * сессий. Это один fetch вместо firebase-admin со всем его деревом
 * зависимостей в серверном бандле.
 *
 * Что нужно завести: проект в Firebase и сервисный ключ к нему. Аккаунта
 * разработчика Google Play для этого не требуется, всё бесплатно.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

const AUTH_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 10_000;

/**
 * Служебный токен живёт час. Держим его в памяти экземпляра функции и меняем
 * заранее: обмен ключа на токен — лишний круг до Google на каждое сообщение.
 */
const TOKEN_TTL_MS = 55 * 60 * 1000;
let cachedToken: { value: string; expiresAt: number } | null = null;

function config() {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  // В переменных окружения перевод строки хранится как \n — возвращаем его.
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");

  return projectId && clientEmail && privateKey
    ? { projectId, clientEmail, privateKey }
    : null;
}

/** Настроены ли пуши. Без этого отправка молча уступает место Telegram. */
export function isPushConfigured(): boolean {
  return config() !== null;
}

async function accessToken(): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  try {
    const key = await importPKCS8(cfg.privateKey, "RS256");
    const now = Math.floor(Date.now() / 1000);

    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(cfg.clientEmail)
      .setSubject(cfg.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("fcm: не выдан служебный токен", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) return null;

    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    return cachedToken.value;
  } catch (err) {
    console.error("fcm: ошибка при получении токена", err);
    return null;
  }
}

export type PushMessage = {
  title: string;
  body: string;
  /** Куда вести по нажатию — путь внутри сайта. */
  path: string;
  /** Сколько непрочитанных всего: для значка на иконке. */
  badge?: number;
};

export type PushResult = {
  /** Сколько устройств приняли сообщение. */
  sent: number;
  /** Токены, которые больше не существуют, — их нужно удалить из базы. */
  dead: string[];
};

/**
 * Ответ FCM на мёртвый токен.
 *
 * UNREGISTERED — приложение удалили или переустановили. NOT_FOUND и
 * INVALID_ARGUMENT приходят на токен, которого никогда не было. Во всех трёх
 * случаях запись в базе бесполезна и только тратит круг до Google на каждом
 * уведомлении.
 */
function isDeadToken(status: number, body: string): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 403) return false;
  return /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(body);
}

async function sendOne(
  projectId: string,
  auth: string,
  token: string,
  message: PushMessage
): Promise<"ok" | "dead" | "failed"> {
  const payload = {
    message: {
      token,
      notification: { title: message.title, body: message.body },
      // Данные нужны оболочке, чтобы открыть нужный чат, а не главную.
      // Значения в data только строковые — так требует FCM.
      data: {
        path: message.path,
        ...(message.badge !== undefined ? { badge: String(message.badge) } : {}),
      },
      android: {
        priority: "HIGH" as const,
        notification: {
          // Своя ветка уведомлений: человек может отключить их в системе,
          // не выключая приложение целиком.
          channelId: "messages",
          ...(message.badge !== undefined
            ? { notificationCount: message.badge }
            : {}),
        },
      },
    },
  };

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }
    );

    if (res.ok) return "ok";

    const text = await res.text();
    if (isDeadToken(res.status, text)) return "dead";

    console.error("fcm: сообщение не доставлено", res.status, text);
    return "failed";
  } catch (err) {
    // Обрыв сети или таймаут. Уведомление — не то, ради чего стоит ронять
    // запрос пользователя, поэтому просто сообщаем о неудаче.
    console.error("fcm: не удалось достучаться", err);
    return "failed";
  }
}

/**
 * Шлёт одно и то же сообщение на все устройства человека.
 *
 * Пакетной отправки в HTTP v1 нет — прежний batch-адрес Google закрыл.
 * Устройств у человека одно-два, поэтому просто идём параллельно.
 */
export async function sendPush(
  tokens: string[],
  message: PushMessage
): Promise<PushResult> {
  if (tokens.length === 0) return { sent: 0, dead: [] };

  const cfg = config();
  const auth = await accessToken();
  if (!cfg || !auth) return { sent: 0, dead: [] };

  const results = await Promise.all(
    tokens.map(async (token) => ({
      token,
      outcome: await sendOne(cfg.projectId, auth, token, message),
    }))
  );

  return {
    sent: results.filter((r) => r.outcome === "ok").length,
    dead: results.filter((r) => r.outcome === "dead").map((r) => r.token),
  };
}

/** Для тестов: сбрасывает запомненный служебный токен. */
export function forgetAccessToken(): void {
  cachedToken = null;
}
