import "server-only";
import crypto from "node:crypto";

/**
 * Два провайдера входа по OAuth 2.0 — Google и Mail.ru.
 *
 * Готовую библиотеку не берём: в проекте уже есть свои сессии и вход через
 * бота, а Auth.js потребовал бы переписать и то и другое. Здесь же нужен
 * ровно стандартный обмен «код → токен → профиль», это несколько запросов.
 */

export type ProviderId = "google" | "mailru";

export type Profile = {
  providerAccountId: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
};

type Provider = {
  id: ProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  /** Google требует PKCE-подобной защиты; Mail.ru её не поддерживает. */
  usePkce: boolean;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  parseProfile: (raw: Record<string, unknown>) => Profile;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    id: "google",
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    usePkce: true,
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    parseProfile: (raw) => ({
      providerAccountId: String(raw.sub ?? ""),
      email: str(raw.email),
      firstName: str(raw.given_name) ?? str(raw.name) ?? "Пользователь",
      lastName: str(raw.family_name),
      photoUrl: str(raw.picture),
    }),
  },
  mailru: {
    id: "mailru",
    label: "Mail.ru",
    authorizeUrl: "https://oauth.mail.ru/login",
    tokenUrl: "https://oauth.mail.ru/token",
    userInfoUrl: "https://oauth.mail.ru/userinfo",
    scope: "userinfo",
    usePkce: false,
    clientId: () => process.env.MAILRU_CLIENT_ID,
    clientSecret: () => process.env.MAILRU_CLIENT_SECRET,
    parseProfile: (raw) => ({
      providerAccountId: String(raw.id ?? ""),
      email: str(raw.email),
      firstName: str(raw.first_name) ?? str(raw.nickname) ?? "Пользователь",
      lastName: str(raw.last_name),
      photoUrl: str(raw.image),
    }),
  },
};

export function isProvider(value: string): value is ProviderId {
  return value === "google" || value === "mailru";
}

export function isConfigured(id: ProviderId): boolean {
  const p = PROVIDERS[id];
  return Boolean(p.clientId() && p.clientSecret());
}

export function configuredProviders(): ProviderId[] {
  return (["google", "mailru"] as ProviderId[]).filter(isConfigured);
}

export function redirectUri(origin: string, id: ProviderId): string {
  return `${origin}/api/auth/oauth/${id}/callback`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(params: {
  id: ProviderId;
  origin: string;
  state: string;
  codeVerifier: string;
}): string {
  const p = PROVIDERS[params.id];
  const url = new URL(p.authorizeUrl);

  url.searchParams.set("client_id", p.clientId()!);
  url.searchParams.set("redirect_uri", redirectUri(params.origin, params.id));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", p.scope);
  url.searchParams.set("state", params.state);

  if (p.usePkce) {
    url.searchParams.set("code_challenge", pkceChallenge(params.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    // Без этого Google не отдаёт профиль повторно вошедшему.
    url.searchParams.set("prompt", "select_account");
  }

  return url.toString();
}

export async function exchangeCode(params: {
  id: ProviderId;
  origin: string;
  code: string;
  codeVerifier: string;
}): Promise<string> {
  const p = PROVIDERS[params.id];

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: redirectUri(params.origin, params.id),
    client_id: p.clientId()!,
    client_secret: p.clientSecret()!,
  });
  if (p.usePkce) body.set("code_verifier", params.codeVerifier);

  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token exchange: нет access_token");
  return data.access_token;
}

export async function fetchProfile(
  id: ProviderId,
  accessToken: string
): Promise<Profile> {
  const p = PROVIDERS[id];

  // Mail.ru принимает токен параметром запроса, Google — заголовком.
  const url = new URL(p.userInfoUrl);
  if (!p.usePkce) url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, {
    headers: p.usePkce ? { Authorization: `Bearer ${accessToken}` } : {},
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status} ${await res.text()}`);
  }

  const raw = (await res.json()) as Record<string, unknown>;
  const profile = p.parseProfile(raw);
  if (!profile.providerAccountId) throw new Error("userinfo: нет идентификатора");
  return profile;
}
