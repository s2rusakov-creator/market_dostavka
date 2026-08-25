import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getThread, markThreadRead } from "@/lib/threads";
import { ChatView } from "@/components/ChatView";
import { localePath, type Locale } from "@/i18n/routing";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  // Запоминаем, куда человек шёл: после входа вернём сюда, а не на главную.
  if (!user) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(localePath(locale, `/chats/${id}`))}`);

  const thread = await getThread(id, user.id);
  if (!thread) notFound();

  // Человек открыл переписку и видит её целиком — значит непрочитанного здесь
  // больше нет. Раньше это делал первый тик опроса, теперь у него строгий
  // курсор и на открытие он ничего не возвращает.
  await markThreadRead(id, user.id);

  return (
    <ChatView
      threadId={thread.id}
      listingTitle={thread.listingTitle}
      listingPriceRub={thread.listingPriceRub}
      otherName={thread.otherName}
      otherFirstName={thread.otherFirstName}
      otherLastName={thread.otherLastName}
      initialMessages={thread.messages}
      soundEnabled={user.soundEnabled}
    />
  );
}
