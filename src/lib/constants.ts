import type { Category, SizePreset } from "@/generated/prisma/enums";

export const CATEGORIES: Category[] = [
  "DOCUMENTS",
  "MEDICINE",
  "ELECTRONICS",
  "CLOTHES",
  "OTHER",
];

export const SIZE_PRESETS: SizePreset[] = ["POCKET", "BAG", "LUGGAGE"];

export const SORTS = ["newest", "cheapest", "expensive", "deadline"] as const;
export type Sort = (typeof SORTS)[number];

/** Показывается подсказкой в форме, пока сделок мало — считается по факту. */
export const FALLBACK_AVG_PRICE = 5400;

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_MESSAGE_LENGTH = 2000;
