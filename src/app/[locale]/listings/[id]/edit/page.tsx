import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStats } from "@/lib/listings";
import { NewListingForm } from "@/components/NewListingForm";
import { localePath, type Locale } from "@/i18n/routing";

/** Дата для поля выбора: «ГГГГ-ММ-ДД» в UTC, как её и хранят. */
const forDateInput = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  // Запоминаем, куда человек шёл: после входа вернём сюда, а не на главную.
  if (!user)
    redirect(
      `${localePath(locale, "/login")}?next=${encodeURIComponent(
        localePath(locale, `/listings/${id}/edit`)
      )}`
    );

  const [listing, stats] = await Promise.all([
    prisma.listing.findUnique({ where: { id } }),
    getStats(),
  ]);

  // Чужую заявку правит только её автор. Отвечаем «не найдено», а не
  // «запрещено»: посторонний не должен даже узнать, что такая заявка есть.
  if (!listing || listing.authorId !== user.id) notFound();

  // Закрытую сделку не переписывают задним числом — отправляем в список,
  // где видно её настоящий статус.
  if (listing.status === "DONE" || listing.status === "CANCELLED") {
    redirect(localePath(locale, "/my"));
  }

  return (
    <NewListingForm
      avgPrice={stats.avgPrice}
      draft={{
        id: listing.id,
        category: listing.category,
        title: listing.title,
        description: listing.description ?? "",
        weight: listing.weightKg ? listing.weightKg.toString() : "",
        sizePreset: listing.sizePreset,
        deadlineFrom: forDateInput(listing.deadlineFrom),
        deadlineTo: forDateInput(listing.deadlineTo),
        pickupArea: listing.pickupArea ?? "",
        price: String(listing.priceRub),
        photoUrl: listing.photoUrl,
        urgent: listing.urgent,
        fragile: listing.fragile,
        needsLuggage: listing.needsLuggage,
      }}
    />
  );
}
