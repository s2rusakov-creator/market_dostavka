"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";

/** Мобильная кнопка «разместить» — в шапке для неё нет места. */
export function NewListingFab() {
  const t = useTranslations("nav");
  const user = useSession();

  return (
    <>
      {/*
        Кнопка вынута из потока, поэтому сама себе места не занимает и всегда
        накрывала низ страницы: внизу ленты под ней пропадал блок статистики.
        Отступ страницы рассчитан только на панель вкладок, а кнопке нужно ещё
        её собственные 84 пикселя снизу плюс высота. Этот распорка и добирает
        разницу — на планшете и шире кнопки нет, поэтому и распорки нет.
      */}
      <div aria-hidden className="h-16 lg:hidden" />

      {/*
        84 пикселя снизу — это высота нижней панели вкладок плюс зазор. Панель
        живёт только на телефоне, поэтому с планшета кнопка опускается: висеть
        над пустотой ей незачем.
      */}
      <Link
        href={user ? "/new" : "/login"}
        className="fixed bottom-[84px] right-4 z-20 rounded-full bg-ochre px-5 py-3 text-sm font-semibold text-cream shadow-lg shadow-ink/25 md:bottom-6 lg:hidden"
      >
        {t("postListing")}
      </Link>
    </>
  );
}
