import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStats } from "@/lib/listings";
import { NewListingForm } from "@/components/NewListingForm";
import { localePath, type Locale } from "@/i18n/routing";

export default async function NewListingPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  // Запоминаем, куда человек шёл: после входа вернём сюда, а не на главную.
  if (!user) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(localePath(locale, "/new"))}`);

  const stats = await getStats();
  return <NewListingForm avgPrice={stats.avgPrice} />;
}
