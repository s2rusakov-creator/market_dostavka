import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Golos_Text, Source_Serif_4 } from "next/font/google";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { SessionProvider } from "@/components/SessionProvider";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import "../globals.css";

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
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
