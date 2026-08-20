import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getFeed, getStats } from "@/lib/listings";
import { ListingCard } from "@/components/ListingCard";
import { Filters } from "@/components/Filters";
import { Sidebar } from "@/components/Sidebar";
import { NewListingFab } from "@/components/NewListingFab";
import type { Locale } from "@/i18n/routing";

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ category?: string; sort?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { category, sort } = await searchParams;
  const [t, user, stats] = await Promise.all([
    getTranslations({ locale }),
    getCurrentUser(),
    getStats(),
  ]);
  const listings = await getFeed({ category, sort, userId: user?.id ?? null });

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-8 md:py-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Filters total={stats.active} />

          {listings.length === 0 ? (
            <p className="rounded-xl bg-cream p-8 text-center text-[14px] text-slate ring-1 ring-ink/8">
              {category ? t("feed.emptyFiltered") : t("feed.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {listings.map((l) => (
                <ListingCard key={l.id} data={l} />
              ))}
            </div>
          )}
        </div>

        <Sidebar locale={locale} stats={stats} />
      </div>

      <NewListingFab />
    </div>
  );
}
