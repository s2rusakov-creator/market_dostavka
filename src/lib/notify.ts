import "server-only";
import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";

const baseUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TEXTS = {
  ru: {
    newResponse: (who: string, item: string) =>
      `<b>Новый отклик</b>\n${esc(who)} предлагает доставку: «${esc(item)}»`,
    newMessage: (who: string, item: string, text: string) =>
      `<b>${esc(who)}</b> — по заявке «${esc(item)}»\n\n${esc(text)}`,
    open: "Открыть",
  },
  az: {
    newResponse: (who: string, item: string) =>
      `<b>Yeni cavab</b>\n${esc(who)} çatdırılma təklif edir: «${esc(item)}»`,
    newMessage: (who: string, item: string, text: string) =>
      `<b>${esc(who)}</b> — «${esc(item)}» sifarişi üzrə\n\n${esc(text)}`,
    open: "Aç",
  },
} as const;

function texts(locale: string) {
  return locale === "az" ? TEXTS.az : TEXTS.ru;
}

function link(locale: string, path: string): string {
  const prefix = locale === "az" ? "/az" : "";
  return `${baseUrl()}${prefix}${path}`;
}

/** Уведомления шлём фоном: сбой Telegram не должен ронять запрос пользователя. */
export async function notifyNewResponse(params: {
  recipientId: string;
  travelerName: string;
  listingTitle: string;
  threadId: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: params.recipientId },
    select: { telegramId: true, locale: true, notifyEnabled: true },
  });
  if (!user || !user.notifyEnabled) return;

  const t = texts(user.locale);
  const url = link(user.locale, `/chats/${params.threadId}`);
  await sendTelegramMessage(
    user.telegramId,
    `${t.newResponse(params.travelerName, params.listingTitle)}\n\n<a href="${url}">${t.open}</a>`
  );
}

export async function notifyNewMessage(params: {
  recipientId: string;
  authorName: string;
  listingTitle: string;
  text: string;
  threadId: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: params.recipientId },
    select: { telegramId: true, locale: true, notifyEnabled: true },
  });
  if (!user || !user.notifyEnabled) return;

  const t = texts(user.locale);
  const url = link(user.locale, `/chats/${params.threadId}`);
  const preview =
    params.text.length > 300 ? `${params.text.slice(0, 300)}…` : params.text;

  await sendTelegramMessage(
    user.telegramId,
    `${t.newMessage(params.authorName, params.listingTitle, preview)}\n\n<a href="${url}">${t.open}</a>`
  );
}
