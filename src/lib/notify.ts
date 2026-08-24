import "server-only";
import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";
import { deviceTokens, dropDeadDevices } from "./devices";
import { isPushConfigured, sendPush } from "./push";
import { unreadCount } from "./threads";

/**
 * Уведомления о новых откликах и сообщениях.
 *
 * Каналов два, и порядок между ними такой: если у человека есть живое
 * устройство с приложением — шлём пуш, если ни одного не осталось — падаем на
 * Telegram. Так уведомление не задваивается, а тот, кто зашёл через почту или
 * Google и Telegram не привязывал, перестаёт быть отрезанным от площадки:
 * раньше он не узнавал вообще ни о чём.
 *
 * Пуши сами по себе ничего не гарантируют. На телефонах без сервисов Google
 * FCM не работает — такие люди получают Telegram, это осознанное решение.
 */

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
    pushResponseTitle: "Новый отклик",
    pushResponseBody: (who: string, item: string) =>
      `${who} предлагает доставку: «${item}»`,
    pushMessageTitle: (who: string) => who,
    pushHidden: "Новое сообщение",
    pushHiddenBody: "Откройте приложение, чтобы прочитать",
  },
  az: {
    newResponse: (who: string, item: string) =>
      `<b>Yeni cavab</b>\n${esc(who)} çatdırılma təklif edir: «${esc(item)}»`,
    newMessage: (who: string, item: string, text: string) =>
      `<b>${esc(who)}</b> — «${esc(item)}» sifarişi üzrə\n\n${esc(text)}`,
    open: "Aç",
    pushResponseTitle: "Yeni cavab",
    pushResponseBody: (who: string, item: string) =>
      `${who} çatdırılma təklif edir: «${item}»`,
    pushMessageTitle: (who: string) => who,
    pushHidden: "Yeni mesaj",
    pushHiddenBody: "Oxumaq üçün tətbiqi açın",
  },
} as const;

function texts(locale: string) {
  return locale === "az" ? TEXTS.az : TEXTS.ru;
}

function localePath(locale: string, path: string): string {
  return locale === "az" ? `/az${path}` : path;
}

function link(locale: string, path: string): string {
  return `${baseUrl()}${localePath(locale, path)}`;
}

type Recipient = {
  telegramId: bigint | null;
  locale: string;
  notifyEnabled: boolean;
  notifyPreview: boolean;
};

async function loadRecipient(userId: string): Promise<Recipient | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      telegramId: true,
      locale: true,
      notifyEnabled: true,
      notifyPreview: true,
    },
  });
}

/**
 * Пробует доставить пушем. Возвращает true, если хотя бы одно устройство
 * приняло сообщение — тогда запасной канал не нужен.
 */
async function tryPush(params: {
  userId: string;
  title: string;
  body: string;
  path: string;
}): Promise<boolean> {
  if (!isPushConfigured()) return false;

  const tokens = await deviceTokens(params.userId);
  if (tokens.length === 0) return false;

  const badge = await unreadCount(params.userId);
  const { sent, dead } = await sendPush(tokens, {
    title: params.title,
    body: params.body,
    path: params.path,
    badge,
  });

  // Устройства, о смерти которых сказал сам FCM, убираем сразу: иначе каждое
  // следующее уведомление снова пойдёт стучаться в пустоту.
  if (dead.length > 0) await dropDeadDevices(dead);

  return sent > 0;
}

export async function notifyNewResponse(params: {
  recipientId: string;
  travelerName: string;
  listingTitle: string;
  threadId: string;
}): Promise<void> {
  const user = await loadRecipient(params.recipientId);
  if (!user || !user.notifyEnabled) return;

  const t = texts(user.locale);
  const path = `/chats/${params.threadId}`;

  const delivered = await tryPush({
    userId: params.recipientId,
    title: t.pushResponseTitle,
    // Отклик — это факт, а не переписка: скрывать тут нечего, имя и название
    // заявки человек и так увидит в ленте.
    body: t.pushResponseBody(params.travelerName, params.listingTitle),
    path: localePath(user.locale, path),
  });
  if (delivered) return;

  // Уведомлять некуда, если человек пришёл через почту и Telegram не привязал.
  if (!user.telegramId) return;

  const url = link(user.locale, path);
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
  const user = await loadRecipient(params.recipientId);
  if (!user || !user.notifyEnabled) return;

  const t = texts(user.locale);
  const path = `/chats/${params.threadId}`;
  const preview =
    params.text.length > 300 ? `${params.text.slice(0, 300)}…` : params.text;

  const delivered = await tryPush({
    userId: params.recipientId,
    // Здесь договариваются о встречах и передают телефоны, а превью на экране
    // блокировки видно любому, кто рядом. Переключатель в профиле решает,
    // показывать ли имя и текст.
    title: user.notifyPreview ? t.pushMessageTitle(params.authorName) : t.pushHidden,
    body: user.notifyPreview ? preview : t.pushHiddenBody,
    path: localePath(user.locale, path),
  });
  if (delivered) return;

  if (!user.telegramId) return;

  // В Telegram настройка превью не применяется: там уведомление и есть само
  // сообщение, и отправить его без текста — значит не отправить ничего.
  // Скрытием предпросмотра в Telegram человек управляет средствами Telegram.
  const url = link(user.locale, path);
  await sendTelegramMessage(
    user.telegramId,
    `${t.newMessage(params.authorName, params.listingTitle, preview)}\n\n<a href="${url}">${t.open}</a>`
  );
}
