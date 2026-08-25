import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Golos_Text, Source_Serif_4 } from "next/font/google";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { SessionProvider } from "@/components/SessionProvider";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { ServiceWorker } from "@/components/ServiceWorker";
import { PushSetup } from "@/components/PushSetup";
import { isPushConfigured } from "@/lib/push";
import "../globals.css";

/**
 * Цвет строки состояния — цвет шапки: в режиме приложения браузерной рамки
 * нет, и системная полоса должна выглядеть частью сайта, а не швом.
 * viewportFit нужен телефонам с вырезом, иначе шапка уезжает под чёлку.
 */
export const viewport: Viewport = {
  themeColor: "#10251C",
  viewportFit: "cover",
};

const golos = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-golos",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600"],
  variable: "--font-serif-4",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return {
    title: `${t("appName")} — ${t("moscow")} → ${t("baku")}`,
    description: t("tagline"),
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      ],
      apple: "/apple-icon.png",
    },
    // iOS манифест не читает: полноэкранный запуск и название под иконкой
    // задаются этими метками.
    appleWebApp: {
      capable: true,
      title: t("appName"),
      statusBarStyle: "black-translucent",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  const session = user
    ? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photoUrl: user.photoUrl,
        soundEnabled: user.soundEnabled,
      }
    : null;

  return (
    <html lang={locale} className={`${golos.variable} ${serif.variable}`}>
      <body className="min-h-dvh bg-sand">
        <NextIntlClientProvider>
          <SessionProvider value={session}>
            <Header />
            <main className="pb-tabbar md:pb-16">{children}</main>
            <TabBar />
            <ServiceWorker />
            {/*
              Регистрировать устройство есть смысл только тогда, когда серверу
              есть чем отправить пуш. Заодно это оберегает приложение: сборка
              без ключей Firebase падает на запросе токена, а до запроса дело
              не доходит, если ключей нет и на сервере.
            */}
            <PushSetup enabled={isPushConfigured()} />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
