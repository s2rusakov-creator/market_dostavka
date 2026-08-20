import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getThread } from "@/lib/threads";
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
  if (!user) redirect(localePath(locale, "/login"));

  const thread = await getThread(id, user.id);
  if (!thread) notFound();

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
