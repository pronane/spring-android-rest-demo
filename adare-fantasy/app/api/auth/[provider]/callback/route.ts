import { NextResponse } from "next/server";
import { COOKIE, currentUserId, makeToken } from "@/lib/server/auth";
import { appUrl } from "@/lib/server/mail";
import {
  STATE_COOKIE,
  exchangeCode,
  facebookProfile,
  fetchJwks,
  isVerified,
  readState,
  safeNext,
  settingsFor,
  signInWithIdentity,
  verifyIdToken,
  type IdTokenClaims,
  type TokenResponse,
} from "@/lib/server/oauth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

/** Apple posts the code back as a form; the others append it to the query. */
async function readCallback(request: Request): Promise<Record<string, string>> {
  const url = new URL(request.url);
  const out: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    form?.forEach((value, key) => {
      if (typeof value === "string") out[key] = value;
    });
  }
  return out;
}

function failure(base: string, reason: string): NextResponse {
  const response = NextResponse.redirect(`${base}/account?signin=error&reason=${encodeURIComponent(reason)}`, 303);
  response.cookies.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

/**
 * Finishes the flow: state cookie → code exchange → verified ID token →
 * one account per verified email → session cookie.
 *
 * Every failure lands back on the account page with a reason rather than a
 * stack trace, and nothing is signed in on a partial result.
 */
export async function GET(request: Request, context: Params) {
  return handle(request, context);
}

export async function POST(request: Request, context: Params) {
  return handle(request, context);
}

async function handle(request: Request, context: Params): Promise<NextResponse> {
  const base = appUrl(request);
  const { provider } = await context.params;
  const settings = settingsFor(provider);
  if (!settings) return failure(base, "That sign-in provider is not configured.");

  const params = await readCallback(request);
  if (params.error) return failure(base, params.error_description || params.error);

  const cookieHeader = request.headers.get("cookie") ?? "";
  const rawState = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  const state = readState(rawState ? decodeURIComponent(rawState) : undefined);
  if (!state || state.provider !== settings.provider.id) {
    return failure(base, "That sign-in link expired. Try again.");
  }
  if (params.state !== state.state) return failure(base, "Sign-in state did not match. Try again.");
  if (!params.code) return failure(base, "The provider did not return a code.");

  let tokens: TokenResponse;
  try {
    tokens = await exchangeCode(settings, { code: params.code, verifier: state.verifier, origin: base });
  } catch {
    return failure(base, "Could not reach the provider to finish signing in.");
  }
  // Google and Apple must return a signed ID token; Facebook's profile call is
  // its verification path, so an access token is enough there.
  if (!tokens.access_token && !tokens.id_token) {
    return failure(base, tokens.error_description || tokens.error || "The provider did not return a token.");
  }
  if (!tokens.id_token && settings.provider.id !== "facebook") {
    return failure(base, tokens.error_description || tokens.error || "The provider did not return an ID token.");
  }

  let subject = "";
  let email = "";
  let emailVerified = false;
  let name: string | null = null;

  if (tokens.id_token) {
    let keys;
    try {
      keys = await fetchJwks(settings.provider.jwksUrl ?? "");
    } catch {
      return failure(base, "Could not reach the provider to check the sign-in.");
    }
    const verified = verifyIdToken(tokens.id_token, {
      keys,
      issuer: settings.issuer,
      audience: settings.provider.clientId,
      nonce: state.nonce,
    });
    if (!verified.ok) return failure(base, `Sign-in rejected: ${verified.reason}.`);

    const claims: IdTokenClaims = verified.claims;
    subject = claims.sub;
    email = claims.email ?? "";
    emailVerified = isVerified(claims.email_verified);
    name = claims.name ?? null;
    // Apple posts the name once, in a separate field, and never in the token.
    if (!name && params.user) {
      try {
        const posted = JSON.parse(params.user) as { name?: { firstName?: string; lastName?: string } };
        name = [posted.name?.firstName, posted.name?.lastName].filter(Boolean).join(" ") || null;
      } catch {
        name = null;
      }
    }
  } else {
    const profile = await facebookProfile(settings, tokens.access_token ?? "").catch(() => ({ error: "Facebook sign-in failed." }));
    if ("error" in profile) return failure(base, profile.error);
    subject = profile.subject;
    email = profile.email;
    // Facebook only returns an email it has verified.
    emailVerified = true;
    name = profile.name ?? null;
  }

  const signedIn = await signInWithIdentity({
    provider: settings.provider.id,
    subject,
    email,
    emailVerified,
    name,
    currentUserId: await currentUserId(),
  });
  if (!signedIn.ok) return failure(base, signedIn.error);

  const next = safeNext(state.next);
  const target = new URL(`${base}${next}`);
  target.searchParams.set("signin", "ok");
  target.searchParams.set("via", settings.provider.id);

  const response = NextResponse.redirect(target.toString(), 303);
  response.cookies.set(COOKIE, makeToken(signedIn.user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 120,
  });
  response.cookies.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
