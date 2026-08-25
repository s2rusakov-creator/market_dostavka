"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import {
  formatDate,
  formatDateUntil,
  formatPrice,
  formatWeight,
  initials,
  rating,
  relativeTime,
} from "@/lib/format";
import { RespondButton } from "./RespondButton";
import { ReportButton } from "./ReportButton";

export type ListingCardData = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  weightKg: string | null;
  dimensions: string | null;
  sizePreset: string | null;
  deadlineFrom: string | null;
  deadlineTo: string;
  pickupArea: string | null;
  priceRub: number;
  photoUrl: string | null;
  urgent: boolean;
  fragile: boolean;
  needsLuggage: boolean;
  status: string;
  createdAt: string;
  responsesCount: number;
  author: {
    name: string;
    firstName: string;
    lastName: string | null;
    ratingSum: number;
    ratingCount: number;
    deliveriesCount: number;
    sentCount: number;
  };
  isOwn: boolean;
  respondedThreadId: string | null;
  hasResponded: boolean;
};

export function ListingCard({ data }: { data: ListingCardData }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const deadlineTo = new Date(data.deadlineTo);
  const deadline = data.deadlineFrom
    ? t("listing.deadlineRange", {
        from: formatDate(new Date(data.deadlineFrom), locale),
        to: formatDate(deadlineTo, locale),
      })
    : t("listing.deadlineUntil", {
        date: formatDateUntil(deadlineTo, locale),
      });

  const authorRating = rating(data.author.ratingSum, data.author.ratingCount);

  const facts = [
    data.weightKg
      ? `${formatWeight(data.weightKg, locale)} ${t("common.kg")}`
      : null,
    data.dimensions,
    data.sizePreset ? t(`sizes.${data.sizePreset}` as "sizes.BAG") : null,
  ].filter(Boolean) as string[];

  const badges = [
    data.urgent ? { label: t("badges.urgent"), tone: "urgent" } : null,
    data.fragile ? { label: t("badges.fragile"), tone: "plain" } : null,
    data.needsLuggage ? { label: t("badges.needsLuggage"), tone: "plain" } : null,
  ].filter(Boolean) as { label: string; tone: string }[];

  return (
    <article className="rounded-xl bg-cream p-4 shadow-[0_1px_0_rgba(16,37,28,.06)] ring-1 ring-ink/8 md:p-5">
      <div className="flex gap-4">
        {/* Фото показываем на всех экранах: телефон — основное устройство
            аудитории, а вся ценность снимка в том, что пассажир сразу видит
            размер посылки. Заглушку «без фото» на мобильном, наоборот, не
            рисуем — пустой квадрат там только отнимает место у текста. */}
        {data.photoUrl ? (
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-sand ring-1 ring-ink/8 sm:h-24 sm:w-24">
            <Image
              src={data.photoUrl}
              alt={t("listing.photoAlt")}
              width={96}
              height={96}
              sizes="(max-width: 640px) 80px, 96px"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="hidden h-24 w-24 shrink-0 place-items-center rounded-lg bg-sand px-2 text-center text-[11px] leading-tight text-mist ring-1 ring-ink/8 sm:grid">
            {t("listing.noPhoto")}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <h3 className="text-[17px] font-semibold text-ink md:text-lg">
              {data.title}
            </h3>
            {badges.map((b) => (
              <span
                key={b.label}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  b.tone === "urgent"
                    ? "bg-ochre/15 text-ochre"
                    : "bg-ink/6 text-slate"
                }`}
              >
                {b.label}
              </span>
            ))}
            <div className="ml-auto text-right">
              <div className="font-serif text-2xl font-semibold text-ink">
                {formatPrice(data.priceRub, locale)} {t("common.rub")}
              </div>
              <div className="text-[11px] text-stone">
                {t("listing.senderOffers")}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate">
            <span className="rounded-md bg-ink/5 px-2 py-0.5">
              {t(`categories.${data.category}` as "categories.OTHER")}
            </span>
            {facts.map((f) => (
              <span key={f} className="rounded-md bg-ink/5 px-2 py-0.5">
                {f}
              </span>
            ))}
            <span>{deadline}</span>
            {data.pickupArea && (
              <span>{t("listing.pickup", { area: data.pickupArea })}</span>
            )}
          </div>

          {data.description && (
            <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-slate">
              {data.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink/8 text-[11px] font-semibold text-ink">
              {initials(data.author.firstName, data.author.lastName)}
            </span>
            <span className="text-[13.5px] font-semibold text-ink">
              {data.author.name}
            </span>
            {authorRating && (
              <span className="text-[13px] text-slate">★ {authorRating}</span>
            )}
            <span className="text-[13px] text-stone">
              {t("listing.sent", { count: data.author.sentCount })}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RespondButton
              listingId={data.id}
              isOwn={data.isOwn}
              status={data.status}
              hasResponded={data.hasResponded}
              respondedThreadId={data.respondedThreadId}
            />
            {/* Между рендером на сервере и гидратацией проходит время, и
                «4 минуты назад» успевает стать «5 минут назад». Расхождение
                тут ожидаемо и безобидно — клиентское значение и есть верное. */}
            <span className="text-[12.5px] text-stone" suppressHydrationWarning>
              {t("listing.responsesCount", { count: data.responsesCount })} ·{" "}
              {relativeTime(new Date(data.createdAt), locale)}
            </span>
            <div className="ml-auto">
              <ReportButton listingId={data.id} hidden={data.isOwn} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
