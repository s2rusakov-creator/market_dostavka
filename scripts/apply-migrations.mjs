import "dotenv/config";
import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Применение миграций через пул Supabase.
 *
 * `prisma migrate deploy` требует прямого подключения к базе: его движок
 * держит долгую сессию и падает с P1017, когда пул её закрывает. Прямой хост
 * db.<ref>.supabase.co на бесплатном тарифе доступен только по IPv6, которого
 * может не быть — тогда штатный путь недоступен вовсе.
 *
 * Скрипт делает то же, что делает Prisma: выполняет migration.sql в
 * транзакции и заводит запись в _prisma_migrations с тем же checksum, поэтому
 * `prisma migrate status` потом показывает базу актуальной.
 *
 * Каждый шаг идёт по своему соединению и одним запросом: из сетей, где
 * фильтруются длинные исходящие TCP, соединение живёт лишь несколько
 * запросов, и цепочка на одном подключении обрывалась на середине.
 *
 * На окружении с прямым доступом к базе пользуйтесь `npm run db:deploy`.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Не задан ни DIRECT_URL, ни DATABASE_URL");
  process.exit(1);
}

/** Один запрос — одно соединение, с повторами на случай обрыва. */
async function run(sql, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    const client = new Client({
      connectionString: url,
      connectionTimeoutMillis: 20000,
    });
    client.on("error", () => {});
    try {
      await client.connect();
      const result = await client.query(sql);
      await client.end().catch(() => {});
      return result;
    } catch (e) {
      lastError = e;
      await client.end().catch(() => {});
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
  }
  throw lastError;
}

/** Строковый литерал для SQL: значения свои, но экранируем по правилам. */
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

await run(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )
`);

const appliedRows = await run(
  `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`
);
const applied = new Set(appliedRows.rows.map((r) => r.migration_name));

const entries = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

let count = 0;

for (const name of entries) {
  if (applied.has(name)) {
    console.log(`пропуск   ${name} (уже применена)`);
    continue;
  }

  const sql = await readFile(
    path.join(MIGRATIONS_DIR, name, "migration.sql"),
    "utf8"
  );
  const checksum = createHash("sha256").update(sql).digest("hex");

  // Вся миграция вместе с отметкой о применении — одним обменом с сервером.
  const batch = `
BEGIN;
${sql}
INSERT INTO "_prisma_migrations"
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES (${q(randomUUID())}, ${q(checksum)}, ${q(name)}, now(), now(), 1);
COMMIT;
`;

  try {
    await run(batch);
    console.log(`применена ${name}`);
    count++;
  } catch (e) {
    console.error(`ОШИБКА в ${name}: ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
}

console.log(
  count === 0 ? "\nНовых миграций нет — база актуальна." : `\nГотово: ${count}.`
);
