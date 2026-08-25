import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { reviewsFor } from "@/lib/reviews";
import { platformRatingMean } from "@/lib/listings";
import { formatRating } from "@/lib/rating";
import { displayName, formatDate, initials } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * Страница участника.
 *
 * Появилась ради отзывов: до этого их текст не показывался нигде, и человек
 * писал «привёз вовремя, всё аккуратно упаковал» в пустоту. На карточках была
 * только усреднённая звезда — цифра, которую невозможно проверить, хотя в
 * правилах отзывы названы тем, что заменяет договор.
 *
 * Показываем ровно то, что помогает решить, доверять ли: счётчики по обеим
 * ролям, оценку с числом голосов и сами отзывы с текстом.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, person, reviews, platformMean] = await Promise.all([
    getTranslations({ locale }),
    prisma.user.findUnique({
      where: { id },
      select: {
        firstName: true,
        lastName: true,
        ratingSum: true,
        ratingCount: true,
        deliveriesCount: true,
        sentCount: true,
      },
    }),
    reviewsFor(id),
    platformRatingMean(),
  ]);

  if (!person) notFound();

  const name = displayName(person.firstName, person.lastName);
  const stars = formatRating(
    person.ratingSum,
    person.ratingCount,
    platformMean
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <section className="flex items-center gap-4 rounded-xl bg-cream p-5 ring-1 ring-ink/8">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink/8 text-[16px] font-semibold text-ink">
          {initials(person.firstName, person.lastName)}
        </span>
        <div className="min-w-0">
          <h1 className="font-serif text-xl font-semibold text-ink">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate">
            {stars ? (
              <span>
                ★ {stars} ·{" "}
                {t("listing.ratingCount", { count: person.ratingCount })}
              </span>
            ) : (
              <span className="text-stone">{t("listing.newMember")}</span>
            )}
            <span>
              {t("profile.deliveries")}: {person.deliveriesCount}
            </span>
            <span>
              {t("profile.sent")}: {person.sentCount}
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-stone">
          {t("profile.reviews")}
        </h2>

        {reviews.length === 0 ? (
          <p className="rounded-xl bg-cream p-6 text-center text-[14px] text-slate ring-1 ring-ink/8">
            {t("profile.noReviews")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl bg-cream p-4 ring-1 ring-ink/8">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[13.5px] font-semibold text-ink">
                    {"★".repeat(r.rating)}
                    <span className="text-mist">{"★".repeat(5 - r.rating)}</span>
                  </span>
                  <span className="text-[13px] text-slate">{r.authorName}</span>
                  {/* В какой роли человека оценивали: вёз он или отправлял. */}
                  <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate">
                    {r.role === "traveler"
                      ? t("profile.asTraveler")
                      : t("profile.asSender")}
                  </span>
                  <span className="ml-auto text-[12.5px] text-stone">
                    {formatDate(new Date(r.createdAt), locale)}
                  </span>
                </div>

                <div className="mt-1 text-[13px] text-stone">
                  {r.listingTitle}
                </div>

                {r.text && (
                  <p className="mt-2 text-[14px] leading-relaxed text-ink">
                    {r.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
