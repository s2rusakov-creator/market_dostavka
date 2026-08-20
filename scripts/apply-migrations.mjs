import "dotenv/config";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Применение миграций через пул Supabase.
 *
 * `prisma migrate deploy` требует прямого подключения к базе: его движок
 * держит сессию и падает с P1017, когда Supavisor её закрывает. Прямой хост
 * db.<ref>.supabase.co на бесплатном тарифе доступен только по IPv6, которого
 * у машины может не быть — тогда штатный путь недоступен вовсе.
 *
 * Скрипт делает ровно то же, что делает Prisma: выполняет migration.sql в
 * транзакции и заводит запись в _prisma_migrations с тем же checksum, поэтому
 * `prisma migrate status` потом показывает базу актуальной.
 *
 * На окружении с прямым доступом к базе пользуйтесь `npm run db:deploy`.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Не задан ни DIRECT_URL, ни DATABASE_URL");
  process.exit(1);
}

const client = new Client({ connectionString: url, connectionTimeoutMillis: 15000 });
await client.connect();

// Таблица учёта — та же, что создаёт Prisma.
await client.query(`
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

const applied = new Set(
  (
    await client.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`
    )
  ).rows.map((r) => r.migration_name)
);

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

  const sqlPath = path.join(MIGRATIONS_DIR, name, "migration.sql");
  const sql = await readFile(sqlPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ($1, $2, $3, now(), now(), 1)`,
      [randomUUID(), checksum, name]
    );
    await client.query("COMMIT");
    console.log(`применена ${name}`);
    count++;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`ОШИБКА в ${name}: ${e.message.split("\n")[0]}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(
  count === 0 ? "\nНовых миграций нет — база актуальна." : `\nГотово: ${count}.`
);
