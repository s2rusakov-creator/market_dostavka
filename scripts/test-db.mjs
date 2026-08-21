import "dotenv/config";
import { Client } from "pg";
import { execFileSync } from "node:child_process";

/**
 * Готовит отдельную базу для тестов: yol_test рядом с рабочей yol.
 * Отдельная нужна, чтобы тесты могли чистить таблицы, не трогая данные,
 * с которыми идёт разработка.
 *
 *   npm run test:db
 */

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const url = new URL(source);
if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
  console.error(
    "Отказ: DATABASE_URL смотрит не на localhost. Тестовую базу создаём только локально."
  );
  process.exit(1);
}

const TEST_DB = "yol_test";

const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
const exists = await admin.query("select 1 from pg_database where datname = $1", [
  TEST_DB,
]);
if (exists.rowCount === 0) {
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  console.log(`база ${TEST_DB} создана`);
} else {
  console.log(`база ${TEST_DB} уже есть`);
}
await admin.end();

const testUrl = new URL(source);
testUrl.pathname = `/${TEST_DB}`;

execFileSync(process.execPath, ["scripts/apply-migrations.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl.toString(), DIRECT_URL: "" },
});

console.log(`\nстрока подключения для тестов:\n  ${testUrl.toString().replace(/:[^:@]+@/, ":***@")}`);
