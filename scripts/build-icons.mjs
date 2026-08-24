import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Сборка PNG-иконок приложения из SVG-исходников.
 *
 * Исходники лежат рядом, в public/: icon.svg — обычная иконка, а
 * icon-maskable.svg — та же, но ужатая к центру, потому что Android обрезает
 * значок под форму оболочки и гарантированно показывает только середину.
 *
 * PNG нужны, потому что SVG в манифесте понимают не все: Android чаще всего
 * да, а apple-touch-icon для iOS — только растр. Готовые файлы лежат в
 * репозитории, скрипт нужен лишь когда меняется сам знак:
 *
 *   npm run icons
 */

const PUBLIC = path.join(process.cwd(), "public");

/** Что из чего собираем. */
const TARGETS = [
  { from: "icon.svg", to: "icon-192.png", size: 192 },
  { from: "icon.svg", to: "icon-512.png", size: 512 },
  { from: "icon-maskable.svg", to: "icon-maskable-512.png", size: 512 },
  // Safari не умеет ни прозрачность, ни maskable: подкладывает свой фон
  // и скругляет сам. Поэтому обычный знак, 180 — размер из документации Apple.
  { from: "icon.svg", to: "apple-icon.png", size: 180 },
  // Значок вкладки. 32 достаточно: в браузерах его показывают мелко.
  { from: "icon.svg", to: "favicon.png", size: 32 },
];

async function main() {
  for (const { from, to, size } of TARGETS) {
    const svg = await readFile(path.join(PUBLIC, from));
    const png = await sharp(svg, { density: 384 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(path.join(PUBLIC, to), png);
    console.log(`  ${to.padEnd(24)} ${String(size).padStart(3)}px  ${(png.length / 1024).toFixed(1)} КБ`);
  }
  console.log(`Готово: ${TARGETS.length} файлов.`);
}

main().catch((err) => {
  console.error("Не удалось собрать иконки:", err.message);
  process.exit(1);
});
