import "dotenv/config";
import { Client } from "pg";

/**
 * Демо-данные из макета: четыре заявки и их авторы. Нужны, чтобы лента не была
 * пустой на показе. Запуск идемпотентен — id у демо-записей фиксированные.
 *
 * Весь сид отправляется ОДНИМ запросом, а не серией вызовов Prisma. Причина
 * практическая: из сетей с фильтрацией исходящих TCP-соединение до пула
 * Supabase живёт лишь несколько запросов, и серия upsert-ов обрывается на
 * середине. Одна пачка укладывается в один обмен и проходит везде.
 */

// Весь сид — одна транзакция, поэтому транзакционный пул подходит ему лучше
// всего и его слоты не выедаются надолго.
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.error("Не задан ни DIRECT_URL, ни DATABASE_URL");
  process.exit(1);
}

const DAY = 24 * 3600 * 1000;
const inDays = (n: number) =>
  new Date(Date.now() + n * DAY).toISOString().replace("T", " ").slice(0, 23);

/** Экранирование строки для SQL-литерала. */
const q = (v: string | null) =>
  v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;

type Person = {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string;
  ratingSum: number;
  ratingCount: number;
  deliveriesCount: number;
};

const PEOPLE: Person[] = [
  { id: "seed_marina", telegramId: "900000001", firstName: "Марина", lastName: "Кулиева", ratingSum: 49, ratingCount: 10, deliveriesCount: 12 },
  { id: "seed_rustam", telegramId: "900000002", firstName: "Рустам", lastName: "Алиев", ratingSum: 47, ratingCount: 10, deliveriesCount: 5 },
  { id: "seed_leyla", telegramId: "900000003", firstName: "Лейла", lastName: "Мамедова", ratingSum: 50, ratingCount: 10, deliveriesCount: 21 },
  { id: "seed_artem", telegramId: "900000004", firstName: "Артём", lastName: "Волков", ratingSum: 48, ratingCount: 10, deliveriesCount: 8 },
];

type Listing = {
  id: string;
  author: string;
  category: string;
  title: string;
  description: string;
  weightKg: number | null;
  sizePreset: string | null;
  dimensions: string | null;
  deadlineFrom: string | null;
  deadlineTo: string;
  pickupArea: string | null;
  priceRub: number;
  urgent?: boolean;
  fragile?: boolean;
  needsLuggage?: boolean;
};

const LISTINGS: Listing[] = [
  {
    id: "seed_listing_docs",
    author: "seed_marina",
    category: "DOCUMENTS",
    title: "Документы, папка А4",
    description:
      "Тонкая папка, почти без веса. В Баку передать родственнику у метро Нариманов.",
    weightKg: 0.3,
    sizePreset: "POCKET",
    dimensions: null,
    deadlineFrom: null,
    deadlineTo: inDays(4),
    pickupArea: "Хамовники",
    priceRub: 3000,
    urgent: true,
  },
  {
    id: "seed_listing_meds",
    author: "seed_rustam",
    category: "MEDICINE",
    title: "Лекарства из аптеки",
    description:
      "Две упаковки без рецепта, чеки прилагаю. Могу встретить в аэропорту.",
    weightKg: 1.2,
    sizePreset: "BAG",
    dimensions: null,
    deadlineFrom: inDays(0),
    deadlineTo: inDays(6),
    pickupArea: "Внуково",
    priceRub: 5500,
  },
  {
    id: "seed_listing_laptop",
    author: "seed_leyla",
    category: "ELECTRONICS",
    title: "Ноутбук в заводской коробке",
    description:
      "Новый, запечатан. Помещается в ручную кладь вместе с коробкой.",
    weightKg: 2.5,
    sizePreset: "BAG",
    dimensions: "36×26×5 см",
    deadlineFrom: null,
    deadlineTo: inDays(10),
    pickupArea: null,
    priceRub: 9000,
    fragile: true,
  },
  {
    id: "seed_listing_clothes",
    author: "seed_artem",
    category: "CLOTHES",
    title: "Детская одежда, 2 пакета",
    description:
      "Два мягких пакета, можно сминать. Напишите, если есть место в чемодане.",
    weightKg: 4,
    sizePreset: "LUGGAGE",
    dimensions: null,
    deadlineFrom: inDays(12),
    deadlineTo: inDays(16),
    pickupArea: null,
    priceRub: 6000,
    needsLuggage: true,
  },
];

function buildSql(): string {
  const users = PEOPLE.map(
    (p) => `(${q(p.id)}, ${p.telegramId}, ${q(p.firstName)}, ${q(p.lastName)},
      ${p.ratingSum}, ${p.ratingCount}, ${p.deliveriesCount})`
  ).join(",\n      ");

  const listings = LISTINGS.map(
    (l) => `(${q(l.id)}, ${q(l.author)}, ${q(l.category)}::"Category", ${q(l.title)},
      ${q(l.description)}, ${l.weightKg ?? "NULL"},
      ${l.sizePreset ? `${q(l.sizePreset)}::"SizePreset"` : "NULL"},
      ${q(l.dimensions)},
      ${l.deadlineFrom ? `${q(l.deadlineFrom)}::timestamp` : "NULL"},
      ${q(l.deadlineTo)}::timestamp, ${q(l.pickupArea)}, ${l.priceRub},
      ${l.urgent ?? false}, ${l.fragile ?? false}, ${l.needsLuggage ?? false},
      now(), now())`
  ).join(",\n      ");

  const telegramIds = PEOPLE.map((p) => p.telegramId).join(", ");

  return `
BEGIN;

-- Сносим прошлый прогон целиком: демо-пользователи узнаются по служебным
-- telegramId, а каскад уносит их заявки, чаты и сообщения. Реальные аккаунты
-- такие id получить не могут, поэтому задеть чужие данные нельзя.
DELETE FROM "User" WHERE "telegramId" IN (${telegramIds});
DELETE FROM "Listing" WHERE "id" LIKE 'seed_listing_%';

INSERT INTO "User"
  ("id", "telegramId", "firstName", "lastName", "ratingSum", "ratingCount", "deliveriesCount")
VALUES
      ${users};

INSERT INTO "Listing"
  ("id", "authorId", "category", "title", "description", "weightKg", "sizePreset",
   "dimensions", "deadlineFrom", "deadlineTo", "pickupArea", "priceRub",
   "urgent", "fragile", "needsLuggage", "createdAt", "updatedAt")
VALUES
      ${listings};

COMMIT;
`;
}

async function main() {
  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 });
  client.on("error", () => {});
  await client.connect();
  try {
    await client.query(buildSql());
    console.log(
      `Готово: пользователей ${PEOPLE.length}, заявок ${LISTINGS.length}`
    );
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
