import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { displayName, formatDateUntil, formatPrice } from "@/lib/format";
import { ListingActions } from "@/components/ListingActions";
import { localePath, type Locale } from "@/i18n/routing";

export default async function MyPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect(localePath(locale, "/login"));

  const t = await getTranslations({ locale });

  const [mine, responded] = await Promise.all([
    prisma.listing.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        _count: { select: { responses: true } },
        responses: {
          select: {
            traveler: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.thread.findMany({
      where: { travelerId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            priceRub: true,
            deadlineTo: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-serif text-2xl font-semibold text-ink">
        {t("my.title")}
      </h1>

      <section className="mt-6">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-stone">
          {t("my.asSender")}
        </h2>

        {mine.length === 0 ? (
          <p className="rounded-xl bg-cream p-6 text-center text-[14px] text-slate ring-1 ring-ink/8">
            {t("my.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((l) => (
              <li
                key={l.id}
                className="rounded-xl bg-cream p-4 ring-1 ring-ink/8"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[15px] font-semibold text-ink">
                    {l.title}
                  </span>
                  <span className="text-[13px] text-slate">
                    {formatPrice(l.priceRub, locale)} {t("common.rub")}
                  </span>
                  <span className="text-[13px] text-stone">
                    {t("listing.deadlineUntil", {
                      date: formatDateUntil(l.deadlineTo, locale),
                    })}
                  </span>
                  {l.status !== "ACTIVE" && (
                    <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate">
                      {t(`listing.status${l.status}` as "listing.statusDONE")}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-stone">
                    {t("listing.responsesCount", { count: l._count.responses })}
                  </span>
                  <ListingActions
                    id={l.id}
                    status={l.status}
                    responders={l.responses.map((r) => ({
                      id: r.traveler.id,
                      name: displayName(r.traveler.firstName, r.traveler.lastName),
                    }))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-stone">
          {t("my.asTraveler")}
        </h2>

        {responded.length === 0 ? (
          <p className="rounded-xl bg-cream p-6 text-center text-[14px] text-slate ring-1 ring-ink/8">
            {t("my.emptyTraveler")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {responded.map((th) => (
              <li key={th.id}>
                <Link
                  href={`/chats/${th.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-cream p-4 ring-1 ring-ink/8 transition hover:ring-ink/20"
                >
                  <span className="text-[15px] font-semibold text-ink">
                    {th.listing.title}
                  </span>
                  <span className="text-[13px] text-slate">
                    {formatPrice(th.listing.priceRub, locale)} {t("common.rub")}
                  </span>
                  <span className="ml-auto text-[13px] font-semibold text-moss">
                    {t("chat.openChat")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
