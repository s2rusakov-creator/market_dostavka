/**
 * Подготовка снимка перед отправкой: уменьшение и перекодирование в WebP.
 *
 * Зачем это в браузере, а не на сервере:
 *
 * 1. Вес. Фото с телефона — 3–5 МБ и 4000 пикселей по длинной стороне, а в
 *    карточке оно показывается размером 96. Уменьшение до 1600 срезает вес в
 *    десятки раз, WebP добавляет к этому ещё около трети. По мобильному
 *    интернету разница между 4 МБ и 200 КБ — это разница между «загрузилось»
 *    и «человек бросил».
 *
 * 2. Приватность. Снимки с телефона несут EXIF с координатами съёмки.
 *    Сфотографировал посылку дома — опубликовал свой адрес. Перерисовка через
 *    canvas стирает метаданные целиком, и это важнее экономии трафика: люди
 *    здесь договариваются о встречах с незнакомцами.
 *
 * Библиотека не нужна: всё делают createImageBitmap и canvas.toBlob.
 * Если что-то из этого недоступно или упало — отправляем оригинал, потому что
 * заявка без фото хуже, чем заявка с тяжёлым фото.
 */

/** Длинная сторона после уменьшения. Хватает и для карточки, и для просмотра. */
export const MAX_EDGE = 1600;

/** Компромисс: визуально неотличимо от оригинала, но заметно легче. */
export const WEBP_QUALITY = 0.82;

/**
 * Размер после вписывания в квадрат со стороной maxEdge.
 * Пропорции сохраняются, маленькие изображения не растягиваются.
 */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function compressImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;

  try {
    // from-image разворачивает снимок по EXIF: иначе вертикальные фото
    // с телефонов легли бы набок.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const { width, height } = targetSize(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
    );

    // Браузер, не умеющий кодировать WebP, молча отдаёт PNG — тогда смысла нет.
    if (!blob || blob.type !== "image/webp") return file;

    // Маленькую или уже сжатую картинку перекодирование может раздуть.
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^./\\]+$/, "") || "photo";
    return new File([blob], `${name}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
