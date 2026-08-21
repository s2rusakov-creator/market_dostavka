import type { Locale } from "@/i18n/routing";

/**
 * Форматируем сами, без Intl.
 *
 * В ICU, поставляемом с Node, нет данных для az-AZ: Intl молча откатывается
 * к корневой локали и выдаёт «M09 1» вместо «1 sentyabr» и «6,000» вместо
 * «6 000». Молча — то есть try/catch тут не спасает. Правила у нас простые
 * (пробел как разделитель разрядов, запятая в дробях, день + название месяца),
 * поэтому дешевле описать их явно, чем тащить внешнюю библиотеку дат.
 */

const NBSP = " ";

const MONTHS: Record<Locale, readonly string[]> = {
  // Русский — родительный падеж: «20 августа».
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
  az: [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avqust",
    "sentyabr",
    "oktyabr",
    "noyabr",
    "dekabr",
  ],
};

/**
 * Азербайджанский направительный падеж для оборота «до такого-то числа»:
 * «30 avqusta qədər», а не «30 avqust qədər». Суффикс подчиняется гармонии
 * гласных, но месяцев всего двенадцать — список короче и надёжнее правила.
 * В русском для этого оборота падеж тот же, что и в обычной дате.
 */
const MONTHS_DATIVE_AZ: readonly string[] = [
  "yanvara",
  "fevrala",
  "marta",
  "aprelə",
  "maya",
  "iyuna",
  "iyula",
  "avqusta",
  "sentyabra",
  "oktyabra",
  "noyabra",
  "dekabra",
];

/** Русские числительные: 1 минута, 2 минуты, 5 минут. */
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatPrice(rub: number, _locale: Locale): string {
  return Math.round(rub)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Вес приходит из Decimal строкой «2.5» — в обоих языках нужна запятая. */
export function formatWeight(value: string, _locale: Locale): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  // Хвостовые нули не нужны: «4», а не «4,00».
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

export function formatDate(date: Date, locale: Locale): string {
  return `${date.getDate()} ${MONTHS[locale][date.getMonth()]}`;
}

/** Дата для оборота «до …» / «… qədər». */
export function formatDateUntil(date: Date, locale: Locale): string {
  if (locale !== "az") return formatDate(date, locale);
  return `${date.getDate()} ${MONTHS_DATIVE_AZ[date.getMonth()]}`;
}

export function formatTime(date: Date, _locale: Locale): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function relativeTime(date: Date, locale: Locale): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);

  // Часы на клиенте могут немного отставать от серверных — «в будущем»
  // показываем как «только что», а не как отрицательное число.
  if (diffSec < 60) return locale === "az" ? "indicə" : "только что";

  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) {
    return locale === "az"
      ? `${minutes}${NBSP}dəq əvvəl`
      : `${minutes}${NBSP}${pluralRu(minutes, "минуту", "минуты", "минут")} назад`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return locale === "az"
      ? `${hours}${NBSP}saat əvvəl`
      : `${hours}${NBSP}${pluralRu(hours, "час", "часа", "часов")} назад`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return locale === "az" ? "dünən" : "вчера";
  return locale === "az"
    ? `${days}${NBSP}gün əvvəl`
    : `${days}${NBSP}${pluralRu(days, "день", "дня", "дней")} назад`;
}

export function initials(firstName: string, lastName?: string | null): string {
  const a = firstName?.trim()?.[0] ?? "";
  const b = lastName?.trim()?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function displayName(
  firstName: string,
  lastName?: string | null
): string {
  // Из профилей Telegram и OAuth фамилия иногда приходит пробелами: без
  // обрезки получалось «Артём  .».
  const surname = lastName?.trim();
  return surname ? `${firstName} ${surname[0].toUpperCase()}.` : firstName;
}

export function rating(sum: number, count: number): string | null {
  if (count === 0) return null;
  return (sum / count).toFixed(1).replace(".", ",");
}
