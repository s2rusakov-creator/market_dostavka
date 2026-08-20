import "dotenv/config";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

/**
 * Диагностика перед деплоем: проверяет, что строки подключения живые,
 * а бакет Storage принимает и отдаёт файл. Секреты не печатает.
 *   npm run check:supabase
 */

const results = [];
const mask = (url) =>
  url ? url.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1***$2") : "(пусто)";

async function checkDb(label, url) {
  if (!url) {
    results.push([label, "—", "не задана"]);
    return;
  }
  if (url.includes("ВСТАВЬТЕ_ПАРОЛЬ")) {
    results.push([label, "ОШИБКА", "пароль не вписан — замените ВСТАВЬТЕ_ПАРОЛЬ в .env"]);
    return;
  }
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 10000,
  });
  const t0 = Date.now();
  try {
    await client.connect();
    const r = await client.query("select current_database() db, inet_server_addr() addr");
    results.push([
      label,
      "ок",
      `${r.rows[0].db}, ${Date.now() - t0} мс, адрес сервера ${r.rows[0].addr ?? "скрыт пулом"}`,
    ]);
  } catch (e) {
    results.push([label, "ОШИБКА", e.message.split("\n")[0]]);
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

async function checkStorage() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || "listing-photos";

  if (!url || !key) {
    results.push(["Storage", "—", "SUPABASE_URL / SUPABASE_SECRET_KEY не заданы"]);
    return;
  }

  // Однопиксельный PNG.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const name = `_healthcheck/${randomUUID()}.png`;

  try {
    const up = await fetch(`${url}/storage/v1/object/${bucket}/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "image/png",
      },
      body: new Uint8Array(png),
      signal: AbortSignal.timeout(15000),
    });

    if (!up.ok) {
      results.push([
        "Storage: загрузка",
        "ОШИБКА",
        `${up.status} ${(await up.text()).slice(0, 160)}`,
      ]);
      return;
    }
    results.push(["Storage: загрузка", "ок", `бакет ${bucket}`]);

    const publicUrl = `${url}/storage/v1/object/public/${bucket}/${name}`;
    const get = await fetch(publicUrl, { signal: AbortSignal.timeout(15000) });
    results.push([
      "Storage: публичное чтение",
      get.ok ? "ок" : "ОШИБКА",
      get.ok ? "файл отдаётся по ссылке" : `${get.status} — бакет не публичный?`,
    ]);

    // За собой убираем, чтобы проверки не копили мусор.
    await fetch(`${url}/storage/v1/object/${bucket}/${name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
  } catch (e) {
    results.push(["Storage", "ОШИБКА", e.message.split("\n")[0]]);
  }
}

console.log("DATABASE_URL:", mask(process.env.DATABASE_URL));
console.log("DIRECT_URL:  ", mask(process.env.DIRECT_URL));
console.log("");

await checkDb("DATABASE_URL (приложение)", process.env.DATABASE_URL);
await checkDb("DIRECT_URL (миграции)", process.env.DIRECT_URL);
await checkStorage();

for (const [label, status, detail] of results) {
  console.log(`${status.padEnd(7)} ${label.padEnd(28)} ${detail}`);
}

process.exit(results.some(([, s]) => s === "ОШИБКА") ? 1 : 0);
