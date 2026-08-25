import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { FEED_PAGE, getFeed, getStats } from "@/lib/listings";
import { Link } from "@/i18n/navigation";
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
  searchParams: Promise<{ category?: string; sort?: string; show?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { category, sort, show } = await searchParams;
  const [t, user, stats] = await Promise.all([
    getTranslations({ locale }),
    getCurrentUser(),
    getStats(),
  ]);
  const feed = await getFeed({
    category,
    sort,
    userId: user?.id ?? null,
    limit: Number(show) || FEED_PAGE,
  });

  /**
   * «Показать ещё» — обычная ссылка с большим пределом, а не кнопка с
   * состоянием на клиенте. Лента серверная, и так она работает даже без
   * скриптов, а адрес с открытыми заявками можно переслать.
   */
  const nextHref = () => {
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (sort) qs.set("sort", sort);
    qs.set("show", String(feed.shown + FEED_PAGE));
    return `/?${qs}`;
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-8 md:py-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Filters total={stats.active} />

          {feed.items.length === 0 ? (
            <p className="rounded-xl bg-cream p-8 text-center text-[14px] text-slate ring-1 ring-ink/8">
              {category ? t("feed.emptyFiltered") : t("feed.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {feed.items.map((l) => (
                <ListingCard key={l.id} data={l} />
              ))}

              {feed.hasMore && (
                <Link
                  href={nextHref() as never}
                  scroll={false}
                  className="rounded-xl bg-cream px-4 py-3 text-center text-[14px] font-semibold text-pine ring-1 ring-ink/8 transition hover:ring-ink/20"
                >
                  {t("feed.showMore")}
                </Link>
              )}
            </div>
          )}
        </div>

        <Sidebar locale={locale} stats={stats} />
      </div>

      <NewListingFab />
    </div>
  );
}
