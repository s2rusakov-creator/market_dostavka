import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  configuredProviders,
  isConfigured,
  isProvider,
  pkceChallenge,
  randomToken,
  redirectUri,
  PROVIDERS,
} from "@/lib/oauth";

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "MAILRU_CLIENT_ID",
  "MAILRU_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("isProvider", () => {
  it("пропускает только известные имена", () => {
    expect(isProvider("google")).toBe(true);
    expect(isProvider("mailru")).toBe(true);
    expect(isProvider("vkontakte")).toBe(false);
    expect(isProvider("")).toBe(false);
    expect(isProvider("../../etc/passwd")).toBe(false);
  });
});

describe("isConfigured / configuredProviders", () => {
  it("без ключей провайдеров нет", () => {
    expect(configuredProviders()).toEqual([]);
  });

  it("одного ключа мало — нужны оба", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    expect(isConfigured("google")).toBe(false);

    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(isConfigured("google")).toBe(true);
    expect(configuredProviders()).toEqual(["google"]);
  });
});

describe("redirectUri", () => {
  it("без переменной берёт адрес запроса", () => {
    expect(redirectUri("https://example.com", "google")).toBe(
      "https://example.com/api/auth/oauth/google/callback"
    );
  });

  it("с переменной берёт канонический адрес, а не адрес запроса", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://yol.example";
    expect(redirectUri("https://yol-abc123-team.vercel.app", "mailru")).toBe(
      "https://yol.example/api/auth/oauth/mailru/callback"
    );
  });

  it("хвостовой слэш и путь в переменной отбрасываются", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://yol.example/";
    expect(redirectUri("https://ignored", "google")).toBe(
      "https://yol.example/api/auth/oauth/google/callback"
    );

    process.env.NEXT_PUBLIC_APP_URL = "https://yol.example/ru?x=1";
    expect(redirectUri("https://ignored", "google")).toBe(
      "https://yol.example/api/auth/oauth/google/callback"
    );
  });

  it("мусор в переменной не ломает вход — откат на адрес запроса", () => {
    process.env.NEXT_PUBLIC_APP_URL = "ЗАМЕНИТЕ-НА-ВАШ-АДРЕС";
    expect(redirectUri("https://example.com", "google")).toBe(
      "https://example.com/api/auth/oauth/google/callback"
    );
  });
});

describe("pkceChallenge", () => {
  it("это base64url от sha256 проверочного кода", () => {
    const verifier = "abc123";
    const expected = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    expect(pkceChallenge(verifier)).toBe(expected);
  });

  it("в результате нет символов, требующих экранирования в URL", () => {
    expect(pkceChallenge(randomToken())).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("randomToken", () => {
  it("не повторяется", () => {
    const set = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(set.size).toBe(200);
  });

  it("безопасен для URL", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("buildAuthorizeUrl", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "google-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.MAILRU_CLIENT_ID = "mailru-id";
    process.env.MAILRU_CLIENT_SECRET = "mailru-secret";
  });

  it("Google получает PKCE", () => {
    const url = new URL(
      buildAuthorizeUrl({
        id: "google",
        origin: "https://yol.example",
        state: "st",
        codeVerifier: "ver",
      })
    );

    expect(url.origin + url.pathname).toBe(PROVIDERS.google.authorizeUrl);
    expect(url.searchParams.get("client_id")).toBe("google-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge("ver"));
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://yol.example/api/auth/oauth/google/callback"
    );
  });

  it("Mail.ru PKCE не поддерживает — параметров быть не должно", () => {
    const url = new URL(
      buildAuthorizeUrl({
        id: "mailru",
        origin: "https://yol.example",
        state: "st",
        codeVerifier: "ver",
      })
    );

    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("code_challenge_method")).toBeNull();
    expect(url.searchParams.get("client_id")).toBe("mailru-id");
  });

  it("секрет приложения в ссылку не попадает", () => {
    const url = buildAuthorizeUrl({
      id: "google",
      origin: "https://yol.example",
      state: "st",
      codeVerifier: "ver",
    });
    expect(url).not.toContain("google-secret");
  });
});

describe("разбор профиля", () => {
  it("Google: имя и фамилия раздельно", () => {
    const p = PROVIDERS.google.parseProfile({
      sub: "123",
      email: "a@b.c",
      given_name: "Марина",
      family_name: "Кулиева",
      picture: "https://pic",
    });
    expect(p).toEqual({
      providerAccountId: "123",
      email: "a@b.c",
      firstName: "Марина",
      lastName: "Кулиева",
      photoUrl: "https://pic",
    });
  });

  it("Google без имени — подставляется запасное", () => {
    const p = PROVIDERS.google.parseProfile({ sub: "123" });
    expect(p.firstName).toBe("Пользователь");
    expect(p.email).toBeNull();
  });

  it("Mail.ru: ник вместо имени, если имени нет", () => {
    const p = PROVIDERS.mailru.parseProfile({
      id: "777",
      nickname: "rustam",
      email: "r@mail.ru",
    });
    expect(p.providerAccountId).toBe("777");
    expect(p.firstName).toBe("rustam");
  });

  it("пустые строки считаются отсутствующими", () => {
    const p = PROVIDERS.google.parseProfile({
      sub: "1",
      email: "",
      given_name: "",
      picture: "",
    });
    expect(p.email).toBeNull();
    expect(p.photoUrl).toBeNull();
    expect(p.firstName).toBe("Пользователь");
  });
});
