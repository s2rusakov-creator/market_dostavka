import "server-only";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_PHOTO_BYTES } from "./constants";
import { HttpError } from "./api";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const UPLOAD_TIMEOUT_MS = 15_000;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Хранилище фото.
 *
 * Если заданы переменные Supabase — файл уходит туда, иначе пишется на диск
 * в public/uploads. Так `npm run dev` работает без облака, а на Vercel, где
 * файловая система только для чтения, включается Supabase Storage.
 *
 * SDK намеренно не используется: нужна ровно одна операция — загрузить файл, —
 * а у Storage для неё есть обычный REST. Один fetch вместо целого дерева
 * зависимостей в серверном бандле.
 */

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  // Supabase перешёл на ключи вида sb_secret_… вместо JWT service_role.
  // Принимаем оба имени переменной, чтобы проект не зависел от того,
  // на какой вкладке панели взят ключ.
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || "listing-photos";
  return url && key ? { url, key, bucket } : null;
}

export function isRemoteStorage(): boolean {
  return supabaseConfig() !== null;
}

export async function saveImage(file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new HttpError("PHOTO_TYPE", 415);
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError("PHOTO_TOO_BIG", 413);

  const name = `${randomUUID()}.${EXT[file.type]}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const cfg = supabaseConfig();
  if (!cfg) {
    await writeFile(path.join(process.cwd(), "public", "uploads", name), buffer);
    return `/uploads/${name}`;
  }

  let res: Response;
  try {
    res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${name}`, {
      method: "POST",
      headers: {
        // Секретный ключ живёт только на сервере: он обходит RLS,
        // в браузер его отдавать нельзя ни при каких условиях.
        Authorization: `Bearer ${cfg.key}`,
        // Storage принимает ключ и заголовком apikey. Шлём оба: так работает
        // и старый JWT service_role, и новый sb_secret_…
        apikey: cfg.key,
        "Content-Type": file.type,
        "cache-control": "public, max-age=31536000, immutable",
        "x-upsert": "false",
      },
      body: new Uint8Array(buffer),
      // Без таймаута зависший запрос держал бы serverless-функцию
      // до принудительного завершения.
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    // Недоступный DNS, обрыв сети или таймаут — здесь fetch бросает, а не
    // возвращает ответ. Пользователю нужна та же понятная ошибка, что и при
    // отказе хранилища, а не общий 500.
    console.error("supabase upload unreachable", err);
    throw new HttpError("UPLOAD_FAILED", 502);
  }

  if (!res.ok) {
    console.error("supabase upload failed", res.status, await res.text());
    throw new HttpError("UPLOAD_FAILED", 502);
  }

  // Бакет публичный на чтение, поэтому подписывать ссылку не нужно.
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${name}`;
}
