import { NextResponse } from "next/server";
import {
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  authorizeUrl,
  createPkce,
  randomToken,
  safeNext,
  settingsFor,
  signState,
  type OAuthState,
} from "@/lib/server/oauth";
import { appUrl } from "@/lib/server/mail";

export const dynamic = "force-dynamic";

/**
 * Starts an authorisation-code flow: a signed, single-use state cookie carries
 * the PKCE verifier and the nonce, and the browser is sent to the provider.
 *
 * `?next=/enter` is honoured on the way back, but only as a path on this site —
 * an absolute URL would make this an open redirect.
 */
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const settings = settingsFor(provider);
  if (!settings) {
    return NextResponse.json({ error: "That sign-in provider is not configured on this deployment." }, { status: 404 });
  }

  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));

  const { verifier, challenge } = createPkce();
  const payload: OAuthState = {
    provider: settings.provider.id,
    state: randomToken(24),
    verifier,
    nonce: randomToken(16),
    next,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };

  const target = authorizeUrl(settings, {
    origin: appUrl(request),
    state: payload.state,
    challenge,
    nonce: payload.nonce,
  });

  const response = NextResponse.redirect(target, 303);
  response.cookies.set(STATE_COOKIE, signState(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
