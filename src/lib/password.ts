import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";

/**
 * Хеширование паролей на встроенном в Node scrypt.
 *
 * bcrypt и argon2 в Node — нативные модули: их приходится собирать под
 * платформу, и на serverless это лишняя морока. scrypt входит в стандартную
 * библиотеку, устойчив к перебору на видеокартах и не тянет зависимостей.
 *
 * Формат хранения: scrypt$N$r$p$соль$хеш — параметры записаны рядом, поэтому
 * их можно будет усилить, не ломая старые пароли.
 */

const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

const N = 16384; // 2^14 — примерно 50–100 мс на проверку
const r = 8;
const p = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;

// scrypt требует памяти примерно 128 * N * r байт; по умолчанию Node
// ограничивает 32 МБ и падает. Поднимаем лимит явно.
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r,
    p,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(hashRaw, "base64url");

    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem: MAXMEM,
    });

    // Сравнение за постоянное время: иначе по задержке можно подбирать хеш.
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Требования к паролю: длина важнее «обязательной цифры и спецсимвола». */
export function passwordProblem(password: string): "short" | "long" | null {
  if (password.length < 8) return "short";
  if (password.length > 200) return "long";
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
