"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/nextPath";

/**
 * Вход без Telegram для локальной разработки.
 * Рендерится, только если сервер разрешил ALLOW_DEV_LOGIN=1 вне продакшена.
 */
export function DevLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    await fetch("/api/auth/dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "Тестовый пользователь" }),
    });
    router.push((safeNextPath(searchParams.get("next")) ?? "/") as never);
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-ink/10 pt-4">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-stone">
        Локальный вход (только для разработки)
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          className="min-w-0 flex-1 rounded-lg border border-ink/12 bg-white/60 px-3 py-2 text-[14px] outline-none focus:border-pine"
        />
        <button
          type="button"
          onClick={login}
          disabled={busy}
          className="rounded-lg bg-pine px-4 py-2 text-[14px] font-semibold text-cream disabled:opacity-60"
        >
          Войти
        </button>
      </div>
    </div>
  );
}
