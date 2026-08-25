"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";
import { LangSwitch } from "./LangSwitch";
import { AuthButton } from "./AuthButton";

export function Header() {
  const t = useTranslations();
  const pathname = usePathname();
  const user = useSession();

  const nav = [
    { href: "/", label: t("nav.listings") },
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/my", label: t("nav.myListings") },
  ] as const;

  return (
    <header className="sticky top-0 z-30 bg-ink">
      {/*
        На 375 пикселях в строку должны поместиться логотип, плашка маршрута,
        переключатель языка и кнопка входа. В прежних размерах они не влезали:
        по-азербайджански «Daxil ol» ломалось на три строки и занимало почти всю
        высоту шапки, по-русски «Войти» упиралось в самый край без отступа.
        Поэтому на телефоне всё поджато, а с планшета возвращаются прежние
        размеры. Плашку маршрута не прячем — кроме неё на телефоне нигде не
        сказано, что доска только Москва → Баку.
      */}
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 md:h-[74px] md:gap-5 md:px-8 lg:gap-7">
        <Link
          href="/"
          className="shrink-0 font-serif text-xl font-semibold tracking-wide text-cream md:text-2xl"
        >
          {t("common.appName")}
        </Link>

        {/*
          Ниже 360 плашка прячется. На таких экранах — iPhone SE и подобные —
          она вместе с переключателем языка и кнопкой входа не помещается, и
          шапка утаскивала за собой горизонтальную прокрутку всей страницы.
          Маршрут при этом не теряется: он написан в боковом блоке ленты и на
          странице «Как это работает».
        */}
        <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-cream/15 bg-cream/8 px-2.5 py-1 min-[360px]:flex md:gap-2 md:px-3 md:py-1.5">
          <span className="text-[11.5px] font-semibold text-cream md:text-[13px]">
            {t("common.moscow")}
          </span>
          <span className="text-[10px] text-fern md:text-xs">→</span>
          <span className="text-[11.5px] font-semibold text-cream md:text-[13px]">
            {t("common.baku")}
          </span>
        </div>

        {/*
          Зазоры на планшете поджаты, а с 1024 возвращаются к прежним: при
          прежних величинах «Как это работает» и «Мои заявки» переносились
          на две строки — влезали, но выглядели неопрятно.
        */}
        <nav className="ml-2 hidden items-center gap-4 md:flex lg:gap-6">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap pb-1 text-[14.5px] transition ${
                  active
                    ? "border-b-2 border-ochre font-semibold text-cream"
                    : "text-sage hover:text-cream"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
          <LangSwitch />
          <AuthButton />
          {user && (
            /*
              Кнопка появляется только с 1024, хотя ссылки навигации — уже с 768.
              Причина в арифметике: вошедшему по-русски шапка целиком просит
              892 пикселя, и в полосе 768–892 — а это ровно планшеты в портрете —
              она вылезала за край, утаскивая за собой горизонтальную прокрутку
              всей страницы. До 1024 роль этой кнопки играет плавающая.
            */
            <Link
              href="/new"
              className="hidden rounded-lg bg-ochre px-4 py-2 text-sm font-semibold text-cream transition hover:brightness-110 lg:block"
            >
              {t("nav.postListing")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
