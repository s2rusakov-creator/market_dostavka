import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL не задан — скопируйте .env.example в .env");
  }

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      /**
       * Настройки под пул Supabase (Supavisor) и serverless.
       *
       * Пул на той стороне закрывает простаивающие соединения сам, а pg потом
       * отдаёт уже мёртвое — приложение падает с «Connection terminated
       * unexpectedly» на ровном месте. Поэтому закрываем простаивающие раньше,
       * чем это сделает Supavisor, и держим TCP живым keep-alive пакетами.
       */
      // На serverless каждый экземпляр функции должен держать минимум
      // соединений, иначе пул Supabase (15 слотов на бесплатном тарифе)
      // выедается мгновенно.
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      // Молча оборванное соединение иначе висит до таймаута TCP — это около
      // 19 секунд, за которые serverless-функция успевает умереть сама.
      // Лучше быстро отдать ошибку и дать пользователю повторить.
      query_timeout: 10_000,
      statement_timeout: 10_000,
      // Иначе процесс не завершится, пока в пуле есть простаивающие соединения.
      allowExitOnIdle: true,
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
