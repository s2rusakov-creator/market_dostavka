"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  CATEGORIES,
  SIZE_PRESETS,
  MAX_PHOTO_BYTES,
  MAX_SOURCE_BYTES,
} from "@/lib/constants";
import { compressImage } from "@/lib/imageCompression";
import { endOfDayUtc, formatPrice } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

type Errors = Partial<Record<string, string>>;

/**
 * Значения существующей заявки — форма работает и на создание, и на правку.
 * Даты приходят в виде «ГГГГ-ММ-ДД»: ровно то, что понимает поле выбора даты.
 */
export type ListingDraft = {
  id: string;
  category: string;
  title: string;
  description: string;
  weight: string;
  sizePreset: string | null;
  deadlineFrom: string;
  deadlineTo: string;
  pickupArea: string;
  price: string;
  photoUrl: string | null;
  urgent: boolean;
  fragile: boolean;
  needsLuggage: boolean;
};

/**
 * Форма заявки.
 *
 * Одна и та же и для новой, и для правки существующей: поля, проверки и
 * сжатие фото совпадают до последней мелочи, и держать две копии значило бы
 * чинить каждую ошибку дважды. Отличаются только начальные значения, адрес
 * отправки и надпись на кнопке.
 *
 * Правка появилась потому, что опечатку было не исправить: заявку приходилось
 * снимать с публикации и заводить заново, теряя вместе с ней все отклики и
 * переписки.
 */
export function NewListingForm({
  avgPrice,
  draft,
}: {
  avgPrice: number;
  draft?: ListingDraft;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const editing = draft !== undefined;

  const [category, setCategory] = useState<string>(
    draft?.category ?? "DOCUMENTS"
  );
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [weight, setWeight] = useState(draft?.weight ?? "");
  const [sizePreset, setSizePreset] = useState<string | null>(
    draft?.sizePreset ?? null
  );
  const [deadlineFrom, setDeadlineFrom] = useState(draft?.deadlineFrom ?? "");
  const [deadlineTo, setDeadlineTo] = useState(draft?.deadlineTo ?? "");
  const [pickupArea, setPickupArea] = useState(draft?.pickupArea ?? "");
  const [price, setPrice] = useState(draft?.price ?? "");
  const [urgent, setUrgent] = useState(draft?.urgent ?? false);
  const [fragile, setFragile] = useState(draft?.fragile ?? false);
  const [needsLuggage, setNeedsLuggage] = useState(draft?.needsLuggage ?? false);
  // Правила подтверждают один раз, при публикации. Переспрашивать на каждой
  // правке запятой незачем.
  const [accepted, setAccepted] = useState(editing);

  const [photoUrl, setPhotoUrl] = useState<string | null>(
    draft?.photoUrl ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrors((p) => ({ ...p, photo: t("newListing.errors.photoType") }));
      return;
    }
    // Заведомо неподъёмное не пытаемся даже раскодировать: браузер на телефоне
    // на таком просто ляжет.
    if (file.size > MAX_SOURCE_BYTES) {
      setErrors((p) => ({ ...p, photo: t("newListing.errors.photoTooBig") }));
      return;
    }

    setErrors((p) => ({ ...p, photo: undefined }));

    // Сжимаем до проверки лимита: снимок с телефона весит 3–8 МБ и не прошёл
    // бы её, хотя после уменьшения занимает пару сотен килобайт.
    setProcessing(true);
    const prepared = await compressImage(file);
    setProcessing(false);

    if (prepared.size > MAX_PHOTO_BYTES) {
      setErrors((p) => ({ ...p, photo: t("newListing.errors.photoTooBig") }));
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("file", prepared);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    setUploading(false);

    if (res.ok) {
      const data = (await res.json()) as { url: string };
      setPhotoUrl(data.url);
      return;
    }

    // Отказ хранилища — не вина пользователя, и подсказка должна это отражать:
    // «попробуйте ещё раз», а не «что-то пошло не так».
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const message =
      body.error === "UPLOAD_FAILED"
        ? t("newListing.errors.photoUpload")
        : body.error === "PHOTO_TOO_BIG"
          ? t("newListing.errors.photoTooBig")
          : body.error === "PHOTO_TYPE"
            ? t("newListing.errors.photoType")
            : t("common.error");
    setErrors((p) => ({ ...p, photo: message }));
  }

  function validate(): boolean {
    const next: Errors = {};
    if (title.trim().length < 3) next.title = t("newListing.errors.title");
    if (!price || Number(price) <= 0) next.price = t("newListing.errors.price");
    if (!deadlineTo) {
      next.deadlineTo = t("newListing.errors.deadline");
    } else {
      // Тот же расчёт, что на сервере: иначе форма пропускала бы дату,
      // которую API отвергает, или наоборот.
      if (endOfDayUtc(deadlineTo).getTime() < Date.now()) {
        next.deadlineTo = t("newListing.errors.deadlinePast");
      }
    }
    if (!accepted) next.accepted = t("newListing.errors.terms");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    const res = await fetch(
      editing ? `/api/listings/${draft.id}/edit` : "/api/listings",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title: title.trim(),
          description: description.trim(),
          weightKg: weight ? Number(weight.replace(",", ".")) : undefined,
          sizePreset: sizePreset ?? undefined,
          deadlineFrom: deadlineFrom || undefined,
          deadlineTo,
          pickupArea: pickupArea.trim(),
          priceRub: Number(price),
          photoUrl: photoUrl ?? undefined,
          urgent,
          fragile,
          needsLuggage,
          acceptTerms: true,
        }),
      }
    );
    setBusy(false);

    if (res.ok) {
      router.push("/my");
      router.refresh();
    } else {
      setErrors({ form: t("common.error") });
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-2xl px-4 py-6 md:py-10"
      noValidate
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-serif text-2xl font-semibold text-ink md:text-3xl">
          {editing ? t("newListing.editTitle") : t("newListing.title")}
        </h1>
        <span className="text-[13px] text-stone">
          {t("common.moscow")} → {t("common.baku")} ·{" "}
          {t("newListing.onlyDirection")}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-5 rounded-xl bg-cream p-5 ring-1 ring-ink/8 md:p-6">
        <Field label={t("newListing.whatToSend")}>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition ${
                  category === c
                    ? "bg-ink text-cream"
                    : "bg-white/60 text-slate ring-1 ring-ink/10"
                }`}
              >
                {t(`categories.${c}` as "categories.OTHER")}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("newListing.titleLabel")} error={errors.title}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("newListing.titlePlaceholder")}
            className={inputCls(!!errors.title)}
          />
        </Field>

        <Field label={t("newListing.photo")} error={errors.photo}>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-dashed border-ink/25 px-4 py-2.5 text-[13.5px] font-medium text-slate transition hover:border-pine hover:text-pine">
              {processing
                ? t("newListing.photoProcessing")
                : uploading
                  ? t("common.loading")
                  : photoUrl
                    ? t("newListing.photoReplace")
                    : t("newListing.photoAdd")}
              <input
                type="file"
                accept="image/*"
                onChange={onPhoto}
                className="hidden"
              />
            </label>
            {photoUrl && (
              /* Свежезагруженный файл: обычный img проще, чем гонять его через next/image. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoUrl}
                alt=""
                className="h-14 w-14 rounded-lg object-cover ring-1 ring-ink/10"
              />
            )}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-stone">
            {t("newListing.photoHint")}
          </p>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("newListing.weight")}>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder={t("newListing.weightPlaceholder")}
              className={inputCls(false)}
            />
          </Field>

          <Field label={t("newListing.dimensions")}>
            <div className="flex gap-2">
              {SIZE_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSizePreset(sizePreset === s ? null : s)}
                  className={`flex-1 rounded-lg px-2 py-2 text-[13px] font-medium transition ${
                    sizePreset === s
                      ? "bg-ink text-cream"
                      : "bg-white/60 text-slate ring-1 ring-ink/10"
                  }`}
                >
                  {t(`sizes.${s}` as "sizes.BAG")}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label={t("newListing.when")} error={errors.deadlineTo}>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={deadlineFrom}
              onChange={(e) => setDeadlineFrom(e.target.value)}
              className={inputCls(false)}
            />
            <span className="text-stone">—</span>
            <input
              type="date"
              value={deadlineTo}
              onChange={(e) => setDeadlineTo(e.target.value)}
              className={inputCls(!!errors.deadlineTo)}
            />
          </div>
        </Field>

        <Field label={t("newListing.pickupArea")}>
          <input
            value={pickupArea}
            onChange={(e) => setPickupArea(e.target.value)}
            placeholder={t("newListing.pickupPlaceholder")}
            className={inputCls(false)}
          />
        </Field>

        <Field label={t("newListing.price")} error={errors.price}>
          <div className="flex items-center gap-2">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder={t("newListing.pricePlaceholder")}
              className={inputCls(!!errors.price)}
            />
            <span className="text-[15px] text-slate">{t("common.rub")}</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-stone">
            {t("newListing.priceHint", { avg: formatPrice(avgPrice, locale) })}
          </p>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Toggle active={urgent} onClick={() => setUrgent(!urgent)}>
            {t("badges.urgent")}
          </Toggle>
          <Toggle active={fragile} onClick={() => setFragile(!fragile)}>
            {t("badges.fragile")}
          </Toggle>
          <Toggle
            active={needsLuggage}
            onClick={() => setNeedsLuggage(!needsLuggage)}
          >
            {t("badges.needsLuggage")}
          </Toggle>
        </div>

        <Field label={t("newListing.comment")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("newListing.commentPlaceholder")}
            className={`${inputCls(false)} resize-none`}
          />
        </Field>

        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white/50 p-3 ring-1 ring-ink/8">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-pine"
            />
            <span className="text-[13px] leading-relaxed text-slate">
              {t("newListing.acceptTerms")}{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-semibold text-moss underline underline-offset-2"
              >
                {t("newListing.termsLink")}
              </Link>
            </span>
          </label>
          {errors.accepted && (
            <p className="mt-1.5 text-[12.5px] text-danger">{errors.accepted}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || uploading || processing}
            className="rounded-lg bg-pine px-5 py-3 text-[15px] font-semibold text-cream transition hover:bg-ink disabled:opacity-60"
          >
            {editing ? t("newListing.saveChanges") : t("newListing.publish")}
          </button>
          <Link
            href="/"
            className="px-2 text-[14px] font-medium text-slate hover:text-ink"
          >
            {t("common.cancel")}
          </Link>
          {errors.form && (
            <span className="text-[13px] text-danger">{errors.form}</span>
          )}
        </div>

        <p className="text-[12.5px] text-stone">{t("newListing.phoneNote")}</p>
      </div>
    </form>
  );
}

function inputCls(hasError: boolean): string {
  return `w-full rounded-lg border bg-white/60 px-3 py-2.5 text-[15px] text-ink outline-none transition focus:border-pine ${
    hasError ? "border-danger" : "border-ink/12"
  }`;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
        active
          ? "bg-ochre text-cream"
          : "bg-white/60 text-slate ring-1 ring-ink/10"
      }`}
    >
      {children}
    </button>
  );
}
