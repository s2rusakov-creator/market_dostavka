import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Миграции идут по прямому подключению: пул Supabase работает в режиме
    // транзакций и не переживает DDL. В обычной работе приложение ходит
    // через пул (DATABASE_URL) — см. src/lib/prisma.ts.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
