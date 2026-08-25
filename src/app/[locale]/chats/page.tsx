import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getThreads } from "@/lib/threads";
import { formatPrice, initials } from "@/lib/format";
import { BadgeSync } from "@/components/BadgeSync";
import { localePath, type Locale } from "@/i18n/routing";

export default async function ChatsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  // Запоминаем, куда человек шёл: после входа вернём сюда, а не на главную.
  if (!user) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(localePath(locale, "/chats"))}`);

  const [t, threads] = await Promise.all([
    getTranslations({ locale }),
    getThreads(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Число непрочитанных здесь уже посчитано — отдаём его значку на
          иконке приложения, чтобы он не врал после прочтения переписок. */}
      <BadgeSync count={threads.reduce((sum, th) => sum + th.unread, 0)} />

      <h1 className="font-serif text-2xl font-semibold text-ink">
        {t("nav.chats")}
      </h1>

      {threads.length === 0 ? (
        <p className="mt-6 rounded-xl bg-cream p-8 text-center text-[14px] text-slate ring-1 ring-ink/8">
          {t("chat.listEmpty")}
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {threads.map((th) => (
            <li key={th.id}>
              <Link
                href={`/chats/${th.id}`}
                className="flex items-center gap-3 rounded-xl bg-cream p-3.5 ring-1 ring-ink/8 transition hover:ring-ink/20"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/8 text-[12px] font-semibold text-ink">
                  {initials(th.otherFirstName, th.otherLastName)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink">
                      {th.otherName}
                    </span>
                    <span className="ml-auto shrink-0 text-[13px] text-slate">
                      {formatPrice(th.listingPriceRub, locale)}{" "}
                      {t("common.rub")}
                    </span>
                  </div>
                  <div className="truncate text-[13px] text-stone">
                    {th.listingTitle}
                  </div>
                  {th.lastMessage && (
                    <div className="mt-0.5 truncate text-[13px] text-slate">
                      {th.lastMessage}
                    </div>
                  )}
                </div>

                {th.unread > 0 && (
                  <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-ochre px-1.5 text-[12px] font-semibold text-cream">
                    {th.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
