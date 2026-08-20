"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";

export function RespondButton({
  listingId,
  isOwn,
  status,
  respondedThreadId,
}: {
  listingId: string;
  isOwn: boolean;
  status: string;
  respondedThreadId: string | null;
}) {
  const t = useTranslations("listing");
  const router = useRouter();
  const user = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOwn) {
    return (
      <span className="rounded-lg bg-ink/6 px-4 py-2.5 text-sm font-semibold text-slate">
        {t("ownListing")}
      </span>
    );
  }

  if (status !== "ACTIVE") {
    return (
      <span className="rounded-lg bg-ink/6 px-4 py-2.5 text-sm font-semibold text-slate">
        {t(`status${status}` as "statusDONE")}
      </span>
    );
  }

  if (respondedThreadId) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/chats/${respondedThreadId}`)}
        className="rounded-lg border border-pine/30 px-4 py-2.5 text-sm font-semibold text-pine transition hover:bg-pine/8"
      >
        {t("responded")}
      </button>
    );
  }

  async function respond() {
    if (!user) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);

    if (!res.ok) {
      setError("error");
      return;
    }
    const data = (await res.json()) as { threadId: string };
    router.push(`/chats/${data.threadId}`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={respond}
        disabled={busy}
        className="rounded-lg bg-pine px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-ink disabled:opacity-60"
      >
        {t("offerDelivery")}
      </button>
      {error && <span className="text-xs text-danger">!</span>}
    </div>
  );
}
