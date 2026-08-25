import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash } from "node:crypto";
import { sessionSecret } from "./env";

/**
 * Состояние входа через провайдера, упакованное в сам параметр state.
 *
 * В браузере состояние живёт в httpOnly-cookie: ушли к Google, вернулись —
 * cookie на месте, сверили. Внутри приложения так не выходит. Google
 * намеренно отказывает во входе из встроенного веб-вью, поэтому окно
 * провайдера приходится открывать в настоящем браузере телефона, а у него
 * своё хранилище cookie. Возврат приходит туда, где нашей метки нет, и
 * проверка проваливается на пустом месте.
 *
 * Поэтому для приложения состояние едет с собой, в параметре state.
 * Зашифрованным, а не просто подписанным: внутри лежит проверочное слово
 * PKCE, которое по замыслу не должно быть видно никому, кроме нас. Ключ —
 * тот же секрет сессий, приведённый к 32 байтам, как требует алгоритм.
 */

const TTL = "10m";

function key(): Uint8Array {
  // Секрет задаётся строкой произвольной длины, а A256GCM требует ровно
  // 32 байта. Хеш даёт их, не завися от того, что человек написал в .env.
  return new Uint8Array(createHash("sha256").update(sessionSecret()).digest());
}

export type AppState = {
  provider: string;
  /** Код пары: по нему приложение потом заберёт сессию себе. */
  pair: string;
  codeVerifier: string;
  /** Язык приложения: страницу возврата человек увидит на нём же. */
  locale: string;
};

export async function packState(state: AppState): Promise<string> {
  return new EncryptJWT({ ...state })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .encrypt(key());
}

/**
 * Разбирает state обратно. Возвращает null, если это не наш пакет: чужая
 * строка, испорченная или просроченная. Для вызывающего все три случая
 * означают одно — входу не верим.
 */
export async function unpackState(value: string): Promise<AppState | null> {
  try {
    const { payload } = await jwtDecrypt(value, key());
    const { provider, pair, codeVerifier, locale } = payload as Record<
      string,
      unknown
    >;
    if (
      typeof provider !== "string" ||
      typeof pair !== "string" ||
      typeof codeVerifier !== "string" ||
      typeof locale !== "string"
    ) {
      return null;
    }
    return { provider, pair, codeVerifier, locale };
  } catch {
    return null;
  }
}
