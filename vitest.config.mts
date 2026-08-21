import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Маркер "только для сервера" бросает исключение при импорте вне
      // серверного окружения Next. В тестах подменяем его пустышкой.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/setup-db.ts"],
    include: ["tests/**/*.test.ts"],
    // Файлы идут по очереди: тесты работают с одной локальной базой и
    // чистят таблицы перед каждым случаем. При параллельном запуске они
    // затирали данные друг друга.
    fileParallelism: false,
  },
});
