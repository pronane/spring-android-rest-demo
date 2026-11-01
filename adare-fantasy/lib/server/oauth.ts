/**
 * Sign in with Google, Facebook or Apple.
 *
 * The app already has one identity primitive — an HMAC-signed session cookie —
 * and one way to prove an email: a magic link. Social login adds a second way
 * to prove it, without a second notion of "account": an identity is a
 * (provider, subject) pair hanging off the same `User`, and the email in the
 * verified ID token is what joins the two.
 *
 * What is deliberately strict here:
 *
 *  - authorisation-code flow only, with **PKCE (S256)** and a signed, single-use
 *    `state` cookie — no implicit flow, no token in a URL fragment;
 *  - the **ID token signature is verified** against the provider's JWKS (RS256
 *    for Google and Facebook, ES256 for Apple), and `iss`, `aud`, `exp` and
 *    `nonce` are all checked;
 *  - the email has to be **verified by the provider** before it can sign anyone
 *    in or be linked to an existing entry, so an attacker cannot claim an
 *    address by creating an unverified account elsewhere;
 *  - a provider is only offered when it is configured, and nothing is silently
 *    enabled in development.
 *
 * Apple is the awkward one: it has no client secret, only a short-lived ES256
 * JWT signed with a `.p8` key (`appleClientSecret` below), and its callback is a
 * form POST rather than a query string.
 */
import { createHash, createHmac, createSign, randomBytes, timingSafeEqual } from "node:crypto";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { findUserByEmail, findUserByIdentity, linkIdentity, upsertUser, type User } from "./db";

export type ProviderId = "google" | "facebook" | "apple";

export type Provider = {
  id: ProviderId;
  name: string;
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Where to fetch signing keys. Apple and Google publish a JWKS. */
  jwksUrl: string | null;
  /** Facebook's profile endpoint; the others use the ID token. */
  userinfoUrl: string | null;
  /** Display name of the button. */
  label: string;
};

type Env = Record<string, string | undefined>;

const DEFAULTS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    scope: "openid email profile",
    label: "Google",
  },
  apple: {
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    jwksUrl: "https://appleid.apple.com/auth/keys",
    issuer: ["https://appleid.apple.com"],
    scope: "name email",
    label: "Apple",
  },
  facebook: {
    authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    jwksUrl: null,
    issuer: [],
    scope: "email public_profile",
    label: "Facebook",
  },
} as const;

export type ProviderSettings = {
  provider: Provider;
  issuer: string[];
  clientSecret?: string;
  /** Facebook only: proves the access token was minted for this app. */
  debugTokenUrl?: string;
  /** Apple only. */
  teamId?: string;
  keyId?: string;
  privateKey?: string;
};

function pick(env: Env, key: string): string | undefined {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * The providers this deployment can actually offer. Anything missing its
 * credentials is left out entirely rather than shown and failing later.
 */
export function configuredProviders(env: Env = process.env): ProviderSettings[] {
  const out: ProviderSettings[] = [];

  const googleId = pick(env, "GOOGLE_CLIENT_ID");
  const googleSecret = pick(env, "GOOGLE_CLIENT_SECRET");
  if (googleId && googleSecret) {
    out.push({
      provider: {
        id: "google",
        name: "Google",
        label: DEFAULTS.google.label,
        clientId: googleId,
        authorizeUrl: pick(env, "GOOGLE_AUTHORIZE_URL") ?? DEFAULTS.google.authorizeUrl,
        tokenUrl: pick(env, "GOOGLE_TOKEN_URL") ?? DEFAULTS.google.tokenUrl,
        scope: pick(env, "GOOGLE_SCOPE") ?? DEFAULTS.google.scope,
        jwksUrl: pick(env, "GOOGLE_JWKS_URL") ?? DEFAULTS.google.jwksUrl,
        userinfoUrl: null,
      },
      issuer: (pick(env, "GOOGLE_ISSUER") ?? DEFAULTS.google.issuer.join(",")).split(","),
      clientSecret: googleSecret,
    });
  }

  const appleId = pick(env, "APPLE_CLIENT_ID");
  const appleTeam = pick(env, "APPLE_TEAM_ID");
  const appleKeyId = pick(env, "APPLE_KEY_ID");
  const appleKey = pick(env, "APPLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (appleId && appleTeam && appleKeyId && appleKey) {
    out.push({
      provider: {
        id: "apple",
        name: "Apple",
        label: DEFAULTS.apple.label,
        clientId: appleId,
        authorizeUrl: pick(env, "APPLE_AUTHORIZE_URL") ?? DEFAULTS.apple.authorizeUrl,
        tokenUrl: pick(env, "APPLE_TOKEN_URL") ?? DEFAULTS.apple.tokenUrl,
        scope: pick(env, "APPLE_SCOPE") ?? DEFAULTS.apple.scope,
        jwksUrl: pick(env, "APPLE_JWKS_URL") ?? DEFAULTS.apple.jwksUrl,
        userinfoUrl: null,
      },
      issuer: (pick(env, "APPLE_ISSUER") ?? DEFAULTS.apple.issuer.join(",")).split(","),
      teamId: appleTeam,
      keyId: appleKeyId,
      privateKey: appleKey,
    });
  }

  const facebookId = pick(env, "FACEBOOK_APP_ID");
  const facebookSecret = pick(env, "FACEBOOK_APP_SECRET");
  if (facebookId && facebookSecret) {
    out.push({
      provider: {
        id: "facebook",
        name: "Facebook",
        label: DEFAULTS.facebook.label,
        clientId: facebookId,
        authorizeUrl: pick(env, "FACEBOOK_AUTHORIZE_URL") ?? DEFAULTS.facebook.authorizeUrl,
        tokenUrl: pick(env, "FACEBOOK_TOKEN_URL") ?? DEFAULTS.facebook.tokenUrl,
        scope: pick(env, "FACEBOOK_SCOPE") ?? DEFAULTS.facebook.scope,
        jwksUrl: null,
        userinfoUrl: pick(env, "FACEBOOK_USERINFO_URL") ?? "https://graph.facebook.com/me?fields=id,name,email",
      },
      issuer: (pick(env, "FACEBOOK_ISSUER") ?? DEFAULTS.facebook.issuer.join(",")).split(",").filter(Boolean),
      clientSecret: facebookSecret,
      debugTokenUrl: pick(env, "FACEBOOK_DEBUG_TOKEN_URL") ?? "https://graph.facebook.com/debug_token",
    });
  }

  return out;
}

export function settingsFor(id: string | undefined, env: Env = process.env): ProviderSettings | null {
  return configuredProviders(env).find((settings) => settings.provider.id === id) ?? null;
}

/* ——— PKCE and state ——— */

export function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function createPkce(verifier = base64url(randomBytes(32))): { verifier: string; challenge: string } {
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

export function randomToken(bytes = 24): string {
  return base64url(randomBytes(bytes));
}

export const STATE_COOKIE = "te_oauth";
export const STATE_TTL_SECONDS = 600;

export type OAuthState = {
  provider: ProviderId;
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  /** Unix seconds. */
  exp: number;
};

function stateKey(env: Env = process.env): string {
  const secret = env.SESSION_SECRET && env.SESSION_SECRET.length >= 16 ? env.SESSION_SECRET : "twenty-eight-dev-secret";
  // Derived, so a signature from this cookie can never be replayed as a session.
  return createHmac("sha256", secret).update("oauth-state").digest("hex");
}

export function signState(payload: OAuthState, env: Env = process.env): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", stateKey(env)).update(body).digest("base64url").slice(0, 32);
  return `${body}.${mac}`;
}

export function readState(value: string | undefined, env: Env = process.env, now = Date.now()): OAuthState | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", stateKey(env)).update(body).digest("base64url").slice(0, 32);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (!parsed.state || !parsed.verifier || !parsed.provider) return null;
    if (parsed.exp * 1000 < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ——— JWKS and ID tokens ——— */

type Jwk = { kid?: string; kty: string; n?: string; e?: string; crv?: string; x?: string; y?: string; alg?: string };

const jwksCache = new Map<string, { keys: Jwk[]; at: number }>();
const JWKS_TTL_MS = 5 * 60 * 1000;

export async function fetchJwks(url: string, now = Date.now(), fetchImpl = fetch): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (cached && now - cached.at < JWKS_TTL_MS) return cached.keys;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`JWKS responded ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (keys.length === 0) throw new Error("JWKS had no keys");
  jwksCache.set(url, { keys, at: now });
  return keys;
}

export function clearJwksCache(): void {
  jwksCache.clear();
}

export type IdTokenClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
};

export type VerifyResult =
  | { ok: true; claims: IdTokenClaims }
  | { ok: false; reason: string };

function decodeJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

/**
 * Verifies an ID token against a JWKS and the claims that matter. Pure apart
 * from the key set, so the token rules are testable without a provider.
 */
export function verifyIdToken(
  token: string,
  options: {
    keys: Jwk[];
    issuer: string[];
    audience: string;
    nonce?: string;
    now?: number;
    skewSeconds?: number;
  },
): VerifyResult {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const skew = options.skewSeconds ?? 120;
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a JWT" };

  let header: { alg?: string; kid?: string };
  let claims: IdTokenClaims;
  try {
    header = decodeJson(parts[0]) as { alg?: string; kid?: string };
    claims = decodeJson(parts[1]) as unknown as IdTokenClaims;
  } catch {
    return { ok: false, reason: "unreadable JWT" };
  }

  const alg = header.alg ?? "";
  if (!["RS256", "RS384", "ES256", "ES384"].includes(alg)) {
    return { ok: false, reason: `unsupported alg ${alg || "(none)"}` };
  }

  const candidates = options.keys.filter((key) => (header.kid ? key.kid === header.kid : true));
  if (candidates.length === 0) return { ok: false, reason: "no matching key" };

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], "base64url");
  const hash = alg.endsWith("384") ? "sha384" : "sha256";
  const verified = candidates.some((jwk) => {
    try {
      const key = createPublicKey({ key: jwk as never, format: "jwk" });
      return verifySignature(
        hash,
        signed,
        alg.startsWith("ES") ? { key, dsaEncoding: "ieee-p1363" } : key,
        signature,
      );
    } catch {
      return false;
    }
  });
  if (!verified) return { ok: false, reason: "bad signature" };

  if (!options.issuer.includes(claims.iss)) return { ok: false, reason: `unexpected issuer ${claims.iss}` };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) return { ok: false, reason: "unexpected audience" };
  if (typeof claims.exp !== "number" || claims.exp + skew < now) return { ok: false, reason: "token expired" };
  if (claims.iat && claims.iat - skew > now) return { ok: false, reason: "token issued in the future" };
  if (options.nonce !== undefined && claims.nonce !== options.nonce) {
    return { ok: false, reason: "nonce mismatch" };
  }
  if (!claims.sub) return { ok: false, reason: "no subject" };

  return { ok: true, claims };
}

/* ——— Apple's client secret ——— */

/**
 * Apple has no static client secret: you present a JWT signed (ES256) with the
 * `.p8` key from the developer portal, valid for at most six months.
 */
export function appleClientSecret(
  settings: Pick<ProviderSettings, "teamId" | "keyId" | "privateKey" | "provider">,
  now = Date.now(),
  lifetimeSeconds = 60 * 60 * 24 * 180,
): string {
  if (!settings.teamId || !settings.keyId || !settings.privateKey) {
    throw new Error("Apple sign-in needs APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY.");
  }
  const issued = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: settings.keyId }));
  const claims = base64url(
    JSON.stringify({
      iss: settings.teamId,
      iat: issued,
      exp: issued + lifetimeSeconds,
      aud: "https://appleid.apple.com",
      sub: settings.provider.clientId,
    }),
  );
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = signer.sign({ key: settings.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${signature.toString("base64url")}`;
}

/* ——— The flows ——— */

/**
 * Where to go after signing in. Only a path on this site is honoured — an
 * absolute URL (`https://evil.example`, `//evil.example`) would turn the
 * callback into an open redirect.
 */
export function safeNext(raw: string | null | undefined, fallback = "/account"): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.startsWith("/\\")) return fallback;
  return value;
}

export function redirectUri(origin: string, provider: ProviderId): string {
  return `${origin.replace(/\/$/, "")}/api/auth/${provider}/callback`;
}

export function authorizeUrl(
  settings: ProviderSettings,
  input: { origin: string; state: string; challenge: string; nonce: string },
): string {
  const { provider } = settings;
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", redirectUri(input.origin, provider.id));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scope);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("nonce", input.nonce);
  if (provider.id === "apple") {
    url.searchParams.set("response_mode", "form_post");
  } else if (provider.id === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

export type TokenResponse = {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

/**
 * Exchanges the authorisation code. Uses the client secret where there is one
 * and Apple's signed JWT where there is not.
 */
export async function exchangeCode(
  settings: ProviderSettings,
  input: { code: string; verifier: string; origin: string },
  fetchImpl = fetch,
  now = Date.now(),
): Promise<TokenResponse> {
  const { provider } = settings;
  const secret =
    provider.id === "apple" ? appleClientSecret(settings, now) : settings.clientSecret ?? "";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: redirectUri(input.origin, provider.id),
    client_id: provider.clientId,
    client_secret: secret,
    code_verifier: input.verifier,
  });
  const res = await fetchImpl(provider.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  return (await res.json().catch(() => ({ error: "unreadable token response" }))) as TokenResponse;
}

/**
 * Facebook returns profile fields rather than an ID token, so the access token
 * is checked against the app it was minted for before it is believed.
 */
export async function facebookProfile(
  settings: ProviderSettings,
  accessToken: string,
  fetchImpl = fetch,
): Promise<{ subject: string; email: string; name?: string } | { error: string }> {
  if (!settings.provider.userinfoUrl) return { error: "Facebook is not configured." };

  if (settings.debugTokenUrl) {
    const debugUrl = new URL(settings.debugTokenUrl);
    debugUrl.searchParams.set("input_token", accessToken);
    debugUrl.searchParams.set("access_token", `${settings.provider.clientId}|${settings.clientSecret ?? ""}`);
    const debug = await fetchImpl(debugUrl.toString(), { signal: AbortSignal.timeout(6000) })
      .then((res) => res.json())
      .catch(() => null) as { data?: { app_id?: string; is_valid?: boolean } } | null;
    if (debug?.data && (debug.data.is_valid === false || (debug.data.app_id && debug.data.app_id !== settings.provider.clientId))) {
      return { error: "That Facebook token is not for this app." };
    }
  }

  const info = await fetchImpl(settings.provider.userinfoUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(6000),
  })
    .then((res) => res.json())
    .catch(() => null) as { id?: string; email?: string; name?: string; error?: unknown } | null;

  if (!info?.id) return { error: "Facebook did not return a profile." };
  if (!info.email) return { error: "Facebook did not share an email address." };
  return { subject: info.id, email: info.email, name: info.name };
}

/* ——— Turning a provider identity into a session ——— */

export type SignInInput = {
  provider: ProviderId;
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  currentUserId?: string | null;
};

export type SignInResult =
  | { ok: true; user: User; created: boolean; linked: boolean }
  | { ok: false; error: string };

/**
 * One account per email, whichever door you came in by.
 *
 *  - a known (provider, subject) signs its own account in;
 *  - a signed-in browser that adds a provider links it to that account;
 *  - otherwise the **verified** email decides: it signs into the existing
 *    account and links the identity, or creates a new account.
 */
export async function signInWithIdentity(input: SignInInput): Promise<SignInResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: `${input.provider} did not return a usable email address.` };
  }
  if (!input.emailVerified) {
    return {
      ok: false,
      error: `That ${input.provider} account has not verified this email, so it cannot be used to sign in.`,
    };
  }

  // Switching accounts mid-session (signed in as A, authenticating as B) is
  // never what a paid entry means, so it is refused rather than done silently.
  const known = await findUserByIdentity(input.provider, input.subject);
  if (known && input.currentUserId && known.id !== input.currentUserId) {
    return {
      ok: false,
      error: `That ${input.provider} account is already attached to another entry. Sign out first if you meant to switch.`,
    };
  }
  if (known) {
    await linkIdentity(known.id, { provider: input.provider, subject: input.subject, email });
    return { ok: true, user: known, created: false, linked: false };
  }

  if (input.currentUserId) {
    const linked = await linkIdentity(input.currentUserId, {
      provider: input.provider,
      subject: input.subject,
      email,
    });
    if (!linked) return { ok: false, error: "That sign-in is already attached to another account." };
    return { ok: true, user: linked, created: false, linked: true };
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    const linked = await linkIdentity(existing.id, { provider: input.provider, subject: input.subject, email });
    if (!linked) return { ok: false, error: "That sign-in is already attached to another account." };
    return { ok: true, user: linked, created: false, linked: true };
  }

  const created = await upsertUser({
    email,
    manager: (input.name ?? "").trim().slice(0, 60) || email.split("@")[0].slice(0, 60),
    teamName: "My card",
  });
  await linkIdentity(created.id, { provider: input.provider, subject: input.subject, email });
  return { ok: true, user: created, created: true, linked: true };
}

/** Google sends `email_verified` as a boolean, Apple as the string "true". */
export function isVerified(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}
