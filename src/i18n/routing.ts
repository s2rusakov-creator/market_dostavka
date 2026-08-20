import { defineRouting } from "next-intl/routing";

export const locales = ["ru", "az"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "ru",
  // Отправители сидят в Москве и пишут по-русски, поэтому русский без префикса.
  localePrefix: "as-needed",
});

/**
 * Путь с префиксом языка для случаев, где нужен redirect из next/navigation:
 * его тип — never, поэтому TypeScript корректно сужает типы после вызова,
 * в отличие от обёртки next-intl.
 */
export function localePath(locale: Locale, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}
