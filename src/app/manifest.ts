import type { MetadataRoute } from "next";

/**
 * Манифест приложения.
 *
 * Отдаётся по адресу /manifest.webmanifest. В имени файла есть точка, поэтому
 * посредник next-intl его не перехватывает и локаль в путь не подставляет —
 * см. matcher в src/proxy.ts.
 *
 * Язык здесь один, русский: манифест статичен, а по-русски говорит та сторона
 * сделки, которая заявки размещает. На двуязычность самого сайта это не влияет.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YOL — Москва → Баку",
    short_name: "YOL",
    description:
      "Доска заявок на передачу посылок с попутчиками из Москвы в Баку",
    lang: "ru",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Фон сплэш-экрана — цвет полотна сайта, чтобы запуск не мигал белым.
    background_color: "#F6F3EB",
    // Цвет строки состояния — цвет шапки.
    theme_color: "#10251C",
    categories: ["travel", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Android обрезает значок под форму оболочки: у этого варианта рисунок
        // ужат к центру, чтобы обрезка не съела дугу.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
