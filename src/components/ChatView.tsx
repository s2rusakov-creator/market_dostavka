"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSound } from "@/lib/useSound";
import { nextPollDelay } from "@/lib/chatPolling";
import { formatPrice, formatTime, initials } from "@/lib/format";
import { MAX_MESSAGE_LENGTH } from "@/lib/constants";
import type { Locale } from "@/i18n/routing";

type Message = {
  id: string;
  text: string;
  createdAt: string;
  mine: boolean;
};


export function ChatView({
  threadId,
  listingTitle,
  listingPriceRub,
  otherName,
  otherFirstName,
  otherLastName,
  initialMessages,
  soundEnabled,
}: {
  threadId: string;
  listingTitle: string;
  listingPriceRub: number;
  otherName: string;
  otherFirstName: string;
  otherLastName: string | null;
  initialMessages: Message[];
  soundEnabled: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { enabled, play, toggle } = useSound(soundEnabled);

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  // Курсор — пара «время и id»: два сообщения попадают в одну миллисекунду,
  // и одного времени серверу не хватает, чтобы отдать второе ровно один раз.
  const lastAtRef = useRef<string | null>(
    initialMessages.at(-1)?.createdAt ?? null
  );
  const lastIdRef = useRef<string | null>(initialMessages.at(-1)?.id ?? null);
  /**
   * Когда в переписке последний раз что-то происходило.
   * Ноль до первого запуска эффекта: во время рендера часы спрашивать нельзя.
   */
  const lastActivityRef = useRef<number>(0);
  /** Разбудить опрос немедленно — ставится внутри эффекта. */
  const wakeRef = useRef<() => void>(() => {});
  // Известные id держим в ref, а не выводим из состояния: решение «пищать или
  // нет» нужно принять до setState. Внутри апдейтера побочных эффектов быть
  // не должно — React вызывает его дважды в StrictMode, и звук задваивался.
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialMessages.map((m) => m.id))
  );

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(scrollToBottom, [scrollToBottom]);

  // Три реплики на сделку не стоят вебсокета — хватает опроса.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Открыли переписку — считаем это активностью и начинаем с частого шага.
    lastActivityRef.current = Date.now();

    async function poll() {
      const params = new URLSearchParams();
      if (lastAtRef.current) {
        params.set("after", lastAtRef.current);
        if (lastIdRef.current) params.set("afterId", lastIdRef.current);
      }
      const qs = params.size > 0 ? `?${params}` : "";

      try {
        const res = await fetch(`/api/threads/${threadId}/messages${qs}`);
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as { messages: Message[] };
        if (data.messages.length === 0) return;

        const last = data.messages.at(-1)!;
        lastAtRef.current = last.createdAt;
        lastIdRef.current = last.id;

        const fresh = data.messages.filter((m) => !seenIdsRef.current.has(m.id));
        if (fresh.length === 0) return;
        fresh.forEach((m) => seenIdsRef.current.add(m.id));

        // Переписка ожила — возвращаемся к частому шагу.
        lastActivityRef.current = Date.now();

        // Звук — только на чужие сообщения: на свои он был бы эхом.
        if (fresh.some((m) => !m.mine)) play();

        setMessages((prev) => [...prev, ...fresh]);
        scrollToBottom();
      } catch {
        // Сеть моргнула — молча ждём следующего тика.
      }
    }

    const nextDelay = () => nextPollDelay(Date.now() - lastActivityRef.current);

    const stop = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    /**
     * Номер живой цепочки опроса.
     *
     * Запрос может быть в полёте, когда опрос будят заново — своим сообщением
     * или возвратом во вкладку. Тогда старая цепочка, дождавшись ответа, тоже
     * захочет запланировать следующий тик, и таймеров станет два: чат начнёт
     * опрашивать вдвое чаще и уже никогда не выправится. Поэтому каждая
     * цепочка помнит своё поколение и молча выходит, если её сменили.
     */
    let generation = 0;

    // Самопланирующийся таймер, а не setInterval: шаг между тиками меняется,
    // и следующий срок должен считаться после каждого ответа.
    const schedule = (mine: number) => {
      if (cancelled || document.hidden || mine !== generation) return;
      stop();
      timer = setTimeout(async () => {
        await poll();
        schedule(mine);
      }, nextDelay());
    };

    const wakeNow = () => {
      stop();
      const mine = ++generation;
      if (cancelled || document.hidden) return;
      void poll().then(() => schedule(mine));
    };
    wakeRef.current = wakeNow;

    // В свёрнутой вкладке опрашивать нечего: человек всё равно не смотрит,
    // а запрос раз в несколько секунд — самая дорогая часть приложения на
    // бесплатном тарифе. Возвращаясь, догоняем пропущенное сразу, не
    // дожидаясь очередного тика.
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        lastActivityRef.current = Date.now();
        wakeNow();
      }
    };

    schedule(generation);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      wakeRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [threadId, play, scrollToBottom]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;

    setSending(true);
    const res = await fetch(`/api/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value }),
    });
    setSending(false);

    if (!res.ok) return;

    const data = (await res.json()) as { message: Message };
    lastAtRef.current = data.message.createdAt;
    lastIdRef.current = data.message.id;
    seenIdsRef.current.add(data.message.id);
    setMessages((prev) => [...prev, data.message]);
    setText("");
    scrollToBottom();

    // Написал — значит разговор идёт: возвращаем частый шаг и не ждём
    // тридцать секунд до ответа собеседника.
    lastActivityRef.current = Date.now();
    wakeRef.current();
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-56px)] max-w-2xl flex-col px-4 md:h-[calc(100dvh-74px)]">
      <header className="flex items-center gap-3 py-3">
        <Link
          href="/chats"
          className="text-[20px] leading-none text-slate hover:text-ink"
          aria-label={t("common.back")}
        >
          ←
        </Link>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink/8 text-[12px] font-semibold text-ink">
          {initials(otherFirstName, otherLastName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink">
            {otherName}
          </div>
          <div className="text-[12px] text-stone">{t("chat.subtitle")}</div>
        </div>
        <button
          type="button"
          onClick={toggle}
          title={enabled ? t("chat.soundOn") : t("chat.soundOff")}
          aria-label={enabled ? t("chat.soundOn") : t("chat.soundOff")}
          aria-pressed={enabled}
          className={`grid h-9 w-9 place-items-center rounded-full transition ${
            enabled ? "bg-pine/12 text-pine" : "bg-ink/6 text-stone"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4.5 w-4.5"
            aria-hidden
          >
            <path d="M11 5 6 9H3v6h3l5 4z" />
            {enabled ? (
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            ) : (
              <path d="M16 9l5 6M21 9l-5 6" />
            )}
          </svg>
        </button>
      </header>

      <div className="rounded-lg bg-cream px-4 py-2.5 text-[13px] ring-1 ring-ink/8">
        <span className="font-semibold text-ink">{listingTitle}</span>
        <span className="ml-2 text-slate">
          {formatPrice(listingPriceRub, locale)} {t("common.rub")}
        </span>
      </div>

      <div className="my-3 flex flex-1 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="my-auto text-center text-[14px] text-stone">
            {t("chat.empty")}
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
              m.mine
                ? "self-end rounded-br-md bg-pine text-cream"
                : "self-start rounded-bl-md bg-cream text-ink ring-1 ring-ink/8"
            }`}
          >
            <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
              {m.text}
            </p>
            {/* Время сообщения показываем в зоне того, кто читает, — это
                правильно, но сервер его знать не может и рисует своё.
                Расхождение здесь ожидаемо, верное значение клиентское. */}
            <div
              className={`mt-1 text-right text-[11px] ${
                m.mine ? "text-cream/60" : "text-stone"
              }`}
              suppressHydrationWarning
            >
              {formatTime(new Date(m.createdAt), locale)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 pb-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(e);
            }
          }}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={t("chat.placeholder")}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-ink/12 bg-cream px-3 py-2.5 text-[15px] outline-none focus:border-pine"
        />
        <button
          type="submit"
          disabled={sending || text.trim().length === 0}
          className="h-[44px] rounded-lg bg-pine px-4 text-[14px] font-semibold text-cream transition hover:bg-ink disabled:opacity-50"
        >
          {t("common.send")}
        </button>
      </form>

      <p className="pb-3 text-[12px] leading-relaxed text-stone">
        {t("chat.note")}
      </p>
    </div>
  );
}
