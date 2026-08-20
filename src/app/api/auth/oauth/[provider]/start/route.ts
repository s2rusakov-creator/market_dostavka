import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  buildAuthorizeUrl,
  isConfigured,
  isProvider,
  randomToken,
} from "@/lib/oauth";

const STATE_COOKIE = "yol_oauth";
const STATE_TTL_SEC = 600;

/** Начало входа: уводим пользователя к провайдеру. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isProvider(provider) || !isConfigured(provider)) {
    return NextResponse.redirect(new URL("/login?error=provider", req.url));
  }

  const state = randomToken();
  const codeVerifier = randomToken();

  // state и verifier кладём в httpOnly-cookie: сверим их на возврате, чтобы
  // чужой запрос к callback не смог подсунуть свой код авторизации.
  const store = await cookies();
  store.set(STATE_COOKIE, JSON.stringify({ provider, state, codeVerifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SEC,
  });

  const origin = req.nextUrl.origin;
  return NextResponse.redirect(
    buildAuthorizeUrl({ id: provider, origin, state, codeVerifier })
  );
}
