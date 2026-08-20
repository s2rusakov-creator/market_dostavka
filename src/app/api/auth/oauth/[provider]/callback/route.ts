import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, fetchProfile, isConfigured, isProvider } from "@/lib/oauth";
import { findOrCreateOAuthUser } from "@/lib/accounts";
import { createSession } from "@/lib/session";

const STATE_COOKIE = "yol_oauth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));

  if (!isProvider(provider) || !isConfigured(provider)) return fail("provider");

  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!raw) return fail("state");

  let saved: { provider: string; state: string; codeVerifier: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail("state");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // Провайдер может вернуть отказ — пользователь передумал.
  if (req.nextUrl.searchParams.get("error")) return fail("cancelled");
  if (!code || !state) return fail("state");
  if (saved.provider !== provider || saved.state !== state) return fail("state");

  try {
    const accessToken = await exchangeCode({
      id: provider,
      origin: req.nextUrl.origin,
      code,
      codeVerifier: saved.codeVerifier,
    });

    const profile = await fetchProfile(provider, accessToken);
    const user = await findOrCreateOAuthUser(provider, profile);
    await createSession(user.id);

    return NextResponse.redirect(new URL("/", req.url));
  } catch (err) {
    console.error(`oauth ${provider} callback error`, err);
    return fail("oauth");
  }
}
