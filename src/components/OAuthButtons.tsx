import { configuredProviders, PROVIDERS } from "@/lib/oauth";
import { OAuthButton } from "./OAuthButton";

/**
 * Кнопки внешних провайдеров. Показываются только те, для которых заданы
 * ключи, — иначе пользователь упирался бы в кнопку, ведущую в ошибку.
 */
export function OAuthButtons() {
  const providers = configuredProviders();
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {providers.map((id) => (
        <OAuthButton key={id} id={id} label={PROVIDERS[id].label}>
          <ProviderMark id={id} />
        </OAuthButton>
      ))}
    </div>
  );
}

function ProviderMark({ id }: { id: "google" | "mailru" }) {
  if (id === "google") {
    return (
      <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#005FF9" />
      <path
        fill="#fff"
        d="M12.2 6.4a5.6 5.6 0 1 0 3.1 10.26.85.85 0 0 0-.94-1.41 3.9 3.9 0 1 1 1.74-3.25v.53a1.02 1.02 0 0 1-2.04 0V12a2.86 2.86 0 1 0-.85 2.03 2.72 2.72 0 0 0 4.63-1.5V12a5.6 5.6 0 0 0-5.64-5.6zm0 7.36A1.76 1.76 0 1 1 14 12a1.76 1.76 0 0 1-1.8 1.76z"
      />
    </svg>
  );
}
