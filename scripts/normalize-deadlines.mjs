import "dotenv/config";
import { Client } from "pg";

/**
 * Разовая нормализация сроков заявок к календарному дню.
 *
 * До правки сервер собирал конец дня вызовом `setHours` — то есть в своей
 * часовой зоне. На Vercel это UTC, локально любая, и в базе оседали моменты
 * вроде 20:59:59.999 для срока «27 августа». Браузер в Москве и Баку читал
 * такой момент со сдвигом и показывал соседнее число.
 *
 * Скрипт приводит уже сохранённые записи к тому виду, в котором их пишет
 * исправленный код: `deadlineTo` — конец календарных суток, `deadlineFrom` —
 * их начало.
 *
 * Про типы. Колонки объявлены как `timestamp without time zone`, а Prisma
 * трактует такое значение как UTC: строка `2026-08-28 23:59:59.999` приезжает
 * в приложение как `2026-08-28T23:59:59.999Z`. Драйвер `pg` в этом же месте
 * считает значение местным временем и отдаёт `20:59:59.999Z` на машине с
 * UTC+3. Поэтому здесь:
 *
 *   - вся арифметика идёт внутри Postgres по «голому» времени, без
 *     `AT TIME ZONE`: иначе `date_trunc` начинает резать сутки по зоне сессии;
 *   - наружу значения выводятся текстом, а не через JS Date, чтобы отчёт
 *     показывал ровно то, что лежит в колонке.
 *
 * Идемпотентен: повторный запуск ничего не меняет.
 *
 *   node scripts/normalize-deadlines.mjs           — показать, что изменится
 *   node scripts/normalize-deadlines.mjs --apply   — записать
 */

const apply = process.argv.includes("--apply");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!url) {
  console.error("Не задан ни DIRECT_URL, ни DATABASE_URL");
  process.exit(1);
}

/**
 * Конец и начало суток того же дня, что и значение колонки.
 *
 * Скобки обязательны: `::text` связывает сильнее минуса, и без них
 * `interval '1 millisecond'` кастуется в текст, а Postgres отвечает
 * «operator does not exist: timestamp without time zone - text».
 */
const endOf = (col) =>
  `(date_trunc('day', ${col}) + interval '1 day' - interval '1 millisecond')`;
const startOf = (col) => `(date_trunc('day', ${col}))`;

const SELECT_DRIFTED = `
  SELECT
    "id",
    "title",
    "deadlineFrom"::text AS from_now,
    "deadlineTo"::text   AS to_now,
    ${startOf('"deadlineFrom"')}::text AS from_next,
    ${endOf('"deadlineTo"')}::text     AS to_next
  FROM "Listing"
  WHERE "deadlineTo" <> ${endOf('"deadlineTo"')}
     OR ("deadlineFrom" IS NOT NULL AND "deadlineFrom" <> ${startOf('"deadlineFrom"')})
  ORDER BY "createdAt"
`;

const UPDATE = `
  UPDATE "Listing" SET
    "deadlineTo"   = ${endOf('"deadlineTo"')},
    "deadlineFrom" = ${startOf('"deadlineFrom"')}
  WHERE "id" = ANY($1::text[])
`;

const client = new Client({
  connectionString: url,
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();

  const { rows } = await client.query(SELECT_DRIFTED);

  if (rows.length === 0) {
    console.log("Все сроки уже приведены к календарному дню — менять нечего.");
    process.exit(0);
  }

  console.log(`Съехавших заявок: ${rows.length}`);
  for (const row of rows) {
    console.log(
      `  ${row.title}\n` +
        `    было:   ${row.from_now ?? "—"} → ${row.to_now}\n` +
        `    станет: ${row.from_next ?? "—"} → ${row.to_next}`
    );
  }

  if (!apply) {
    console.log("\nЭто предпросмотр. Чтобы записать, повторите с --apply");
    process.exit(0);
  }

  const result = await client.query(UPDATE, [rows.map((r) => r.id)]);
  console.log(`\nОбновлено записей: ${result.rowCount}`);
} catch (err) {
  console.error("Ошибка:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
