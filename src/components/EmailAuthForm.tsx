"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Mode = "login" | "register";

/** Соответствие кодов ошибок сервера сообщениям для человека. */
const ERROR_KEYS: Record<string, string> = {
  BAD_CREDENTIALS: "errBadCredentials",
  EMAIL_TAKEN: "errEmailTaken",
  PASSWORD_SHORT: "errPasswordShort",
  PASSWORD_LONG: "errPasswordLong",
  TOO_MANY_ATTEMPTS: "errTooMany",
  VALIDATION: "errValidation",
};

export function EmailAuthForm() {
  const t = useTranslations("auth");
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const url =
      mode === "login" ? "/api/auth/email/login" : "/api/auth/email/register";
    const body =
      mode === "login"
        ? { email, password }
        : { email, password, firstName, lastName };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const key = ERROR_KEYS[data.error ?? ""] ?? "errValidation";
    setError(t(key as "errBadCredentials"));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === "register" && (
        <div className="flex gap-2">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("firstName")}
            autoComplete="given-name"
            required
            className={inputCls}
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t("lastNameOptional")}
            autoComplete="family-name"
            className={inputCls}
          />
        </div>
      )}

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("email")}
        autoComplete="email"
        required
        className={inputCls}
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("password")}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        minLength={8}
        className={inputCls}
      />

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-pine px-5 py-3 text-[15px] font-semibold text-cream transition hover:bg-ink disabled:opacity-60"
      >
        {mode === "login" ? t("signInEmail") : t("register")}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="text-[13px] text-moss underline underline-offset-2"
      >
        {mode === "login" ? t("noAccount") : t("haveAccount")}
      </button>
    </form>
  );
}

const inputCls =
  "w-full min-w-0 rounded-lg border border-ink/12 bg-white/60 px-3 py-2.5 text-[15px] text-ink outline-none transition focus:border-pine";
