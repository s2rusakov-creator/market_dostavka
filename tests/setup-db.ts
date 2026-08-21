import "dotenv/config";

/**
 * Переключает тесты на отдельную базу yol_test до того, как клиент Prisma
 * впервые обратится к DATABASE_URL. Подключается через setupFiles, поэтому
 * выполняется раньше любого импорта тестового файла.
 *
 * Базу готовит `npm run test:db`.
 */
const source = process.env.DATABASE_URL;

if (!source) {
  throw new Error("DATABASE_URL не задан — тестам нужна локальная база");
}

const url = new URL(source);

if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
  throw new Error(
    "Отказ: DATABASE_URL смотрит не на localhost. Тесты чистят таблицы и не должны касаться боевой базы."
  );
}

url.pathname = "/yol_test";
process.env.DATABASE_URL = url.toString();
process.env.DIRECT_URL = "";
