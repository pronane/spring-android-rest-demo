/**
 * Social sign-in, asserted without a browser, a provider or a real database.
 *
 *   npm run oauth:check
 *
 * The rules that matter here are the ones that decide *who you are*: the state
 * cookie has to be unforgeable, an ID token has to be signed by the provider,
 * and one email has to mean one account whichever door the player came in by.
 * They are tested with keys generated in-process and a throwaway JSON store.
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  appleClientSecret,
  authorizeUrl,
  base64url,
  clearJwksCache,
  configuredProviders,
  createPkce,
  isVerified,
  readState,
  redirectUri,
  safeNext,
  signInWithIdentity,
  signState,
  verifyIdToken,
  type OAuthState,
} from "../lib/server/oauth";
import { findUserByEmail, findUserByIdentity, findUser } from "../lib/server/db";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}

function ok(name: string, passed: boolean, detail = "") {
  checks += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${passed ? "" : `\n      ${detail}`}`);
}

/* ——— keys and hand-made tokens ——— */

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });

function jwk(privateKey: KeyObject, kid?: string) {
  const { kty, n, e, crv, x, y } = privateKey.export({ format: "jwk" }) as Record<string, string>;
  return { kty, n, e, crv, x, y, kid };
}

const rsaKey = { ...jwk(rsa.privateKey, "rsa-1"), alg: "RS256" } as never;
const ecKey = { ...jwk(ec.privateKey, "ec-1"), alg: "ES256" } as never;

function jwt(
  claims: Record<string, unknown>,
  options: { alg?: string; kid?: string; key?: KeyObject; sign?: boolean } = {},
) {
  const alg = options.alg ?? "RS256";
  const header = base64url(JSON.stringify({ alg, kid: options.kid ?? "rsa-1", typ: "JWT" }));
  const body = base64url(JSON.stringify(claims));
  if (options.sign === false) return `${header}.${body}.`;
  const data = Buffer.from(`${header}.${body}`);
  const signature =
    alg === "ES256"
      ? sign("sha256", data, { key: options.key ?? ec.privateKey, dsaEncoding: "ieee-p1363" })
      : sign("sha256", data, options.key ?? rsa.privateKey);
  return `${header}.${body}.${signature.toString("base64url")}`;
}

const NOW = 1_800_000_000; // a fixed second, so nothing depends on the wall clock.
const baseClaims = {
  iss: "https://accounts.google.com",
  aud: "client-123.apps.googleusercontent.com",
  sub: "google-subject-1",
  exp: NOW + 600,
  iat: NOW - 10,
  nonce: "nonce-abc",
  email: "Player@Example.com",
  email_verified: true,
  name: "Aoife Byrne",
};

const google = {
  keys: [rsaKey],
  issuer: ["accounts.google.com", "https://accounts.google.com"],
  audience: "client-123.apps.googleusercontent.com",
  nonce: "nonce-abc",
  now: NOW,
};

/* ——— providers are off until they are configured ——— */

check("nothing is offered before credentials exist", configuredProviders({}).length, 0);
check(
  "a provider with only half its credentials stays hidden",
  configuredProviders({ GOOGLE_CLIENT_ID: "id-only" }).map((p) => p.provider.id),
  [],
);
check(
  "Google appears once it has an id and a secret",
  configuredProviders({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).map((p) => p.provider.id),
  ["google"],
);
check(
  "Apple needs id, team, key id and key — not just a client id",
  configuredProviders({ APPLE_CLIENT_ID: "ie.team.service", APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K" }).length,
  0,
);
const all = configuredProviders({
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "gs",
  APPLE_CLIENT_ID: "a",
  APPLE_TEAM_ID: "t",
  APPLE_KEY_ID: "k",
  APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
  FACEBOOK_APP_ID: "f",
  FACEBOOK_APP_SECRET: "fs",
});
check("all three appear when fully configured", all.map((p) => p.provider.id), ["google", "apple", "facebook"]);
check(
  "Apple's key is unescaped before it is used",
  all[1].privateKey?.includes("\n"),
  true,
);
check(
  "Google's default endpoint is Google's",
  all[0] && new URL(all[0].provider.authorizeUrl).host,
  "accounts.google.com",
);

/* ——— the redirect the provider sends the browser back to ——— */

check(
  "the callback path is per provider",
  redirectUri("https://cup.example", "apple"),
  "https://cup.example/api/auth/apple/callback",
);
check("a trailing slash is not doubled", redirectUri("https://cup.example/", "google"), "https://cup.example/api/auth/google/callback");

const googleAuth = new URL(
  authorizeUrl(all[0], { origin: "https://cup.example", state: "st", challenge: "ch", nonce: "no" }),
);
check("authorisation uses the code flow", googleAuth.searchParams.get("response_type"), "code");
check("with PKCE S256", googleAuth.searchParams.get("code_challenge_method"), "S256");
check("and our own state", googleAuth.searchParams.get("state"), "st");
check("the client id is ours", googleAuth.searchParams.get("client_id"), "g");
check(
  "the redirect URI matches the callback route",
  googleAuth.searchParams.get("redirect_uri"),
  "https://cup.example/api/auth/google/callback",
);
check("the nonce is carried to the token", googleAuth.searchParams.get("nonce"), "no");
check("Google offers account choice", googleAuth.searchParams.get("prompt"), "select_account");

const appleAuth = new URL(
  authorizeUrl(all[1], { origin: "https://cup.example", state: "st", challenge: "ch", nonce: "no" }),
);
check("Apple answers with form_post", appleAuth.searchParams.get("response_mode"), "form_post");
check("and asks only for name and email", appleAuth.searchParams.get("scope"), "name email");

/* ——— PKCE ——— */

const pkce = createPkce("verifier-0123456789");
check(
  "the PKCE challenge is base64url(SHA-256(verifier)) without padding",
  pkce.challenge,
  createHash("sha256").update("verifier-0123456789").digest("base64url"),
);
ok("no padding survives into a query string", !pkce.challenge.includes("="));
ok("a generated verifier is 43+ characters of base64url", createPkce().verifier.length >= 43);
ok(
  "two generated verifiers differ",
  createPkce().verifier !== createPkce().verifier,
);

/* ——— where we send the browser afterwards ——— */

check("a path on this site is honoured", safeNext("/enter"), "/enter");
check("a path with a query survives", safeNext("/account?plan=single"), "/account?plan=single");
check("an absolute URL is refused", safeNext("https://evil.example/steal"), "/account");
check("a protocol-relative URL is refused", safeNext("//evil.example"), "/account");
check("a backslash trick is refused", safeNext("/\\\\evil.example"), "/account");
check("nothing at all falls back", safeNext(null), "/account");

/* ——— the state cookie ——— */

const state: OAuthState = {
  provider: "google",
  state: "state-123",
  verifier: "verifier-123",
  nonce: "nonce-123",
  next: "/account",
  exp: Math.floor(NOW + 600),
};
const env = { SESSION_SECRET: "tour-secret-5f3a91" };
const signed = signState(state, env);
check("a signed state reads back", readState(signed, env, NOW), state);
check("no cookie is no state", readState(undefined, env, NOW), null);
check("a tampered body is rejected", readState(`${signed.split(".")[0]}x.${signed.split(".")[1]}`, env, NOW), null);
check(
  "a tampered signature is rejected",
  readState(`${signed.split(".")[0]}.${"0".repeat(32)}`, env, NOW),
  null,
);
check(
  "another deployment's secret cannot read it",
  readState(signed, { SESSION_SECRET: "a-different-secret-value" }, NOW),
  null,
);
check("an expired state is rejected", readState(signed, env, (NOW + 601) * 1000), null);
check("an unsigned blob is rejected", readState("not-a-state", env, NOW), null);

/* ——— ID tokens ——— */

const good = verifyIdToken(jwt(baseClaims), google);
check("a properly signed token passes", good.ok, true);
check("and yields the subject", good.ok && good.claims.sub, "google-subject-1");

check(
  "a token signed by another key fails",
  verifyIdToken(jwt(baseClaims, { key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey }), google),
  { ok: false, reason: "bad signature" },
);
check(
  "an unsigned (alg=none) token fails",
  verifyIdToken(jwt(baseClaims, { alg: "none", sign: false }), google),
  { ok: false, reason: "unsupported alg none" },
);
check(
  "an unknown key id fails",
  verifyIdToken(jwt({ ...baseClaims }, { kid: "not-ours" }), google),
  { ok: false, reason: "no matching key" },
);
check(
  "the wrong audience fails",
  verifyIdToken(jwt({ ...baseClaims, aud: "someone-else" }), google),
  { ok: false, reason: "unexpected audience" },
);
check(
  "an audience list that includes ours passes",
  verifyIdToken(jwt({ ...baseClaims, aud: ["other", "client-123.apps.googleusercontent.com"] }), google).ok,
  true,
);
check(
  "the wrong issuer fails",
  verifyIdToken(jwt({ ...baseClaims, iss: "https://evil.example" }), google),
  { ok: false, reason: "unexpected issuer https://evil.example" },
);
check(
  "an expired token fails",
  verifyIdToken(jwt({ ...baseClaims, exp: NOW - 600 }), google),
  { ok: false, reason: "token expired" },
);
check(
  "a token that expired 30s ago still passes inside the skew",
  verifyIdToken(jwt({ ...baseClaims, exp: NOW - 30 }), google).ok,
  true,
);
check(
  "a token minted in the future fails",
  verifyIdToken(jwt({ ...baseClaims, iat: NOW + 600 }), google),
  { ok: false, reason: "token issued in the future" },
);
check(
  "the nonce has to be the one we sent",
  verifyIdToken(jwt({ ...baseClaims, nonce: "replayed" }), google),
  { ok: false, reason: "nonce mismatch" },
);
check("a token with no subject fails", verifyIdToken(jwt({ ...baseClaims, sub: "" }), google).ok, false);
check("three parts are required", verifyIdToken("a.b", google).ok, false);

// Apple signs with ES256, and its signatures are raw r||s, not DER.
const appleToken = verifyIdToken(
  jwt({ ...baseClaims, iss: "https://appleid.apple.com", aud: "ie.team.signin" }, { alg: "ES256", kid: "ec-1" }),
  {
    keys: [ecKey],
    issuer: ["https://appleid.apple.com"],
    audience: "ie.team.signin",
    nonce: "nonce-abc",
    now: NOW,
  },
);
check("an ES256 token from Apple verifies", appleToken.ok, true);

/* ——— Apple's client secret is a JWT, not a string ——— */

const appleKeyPem = generateKeyPairSync("ec", { namedCurve: "P-256" });
const secret = appleClientSecret(
  {
    ...all[1],
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    privateKey: appleKeyPem.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  },
  NOW * 1000,
);
const [secretHeader, secretBody] = secret
  .split(".")
  .slice(0, 2)
  .map((part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")));
check("Apple's secret is an ES256 JWT", secretHeader.alg, "ES256");
check("keyed by the developer key id", secretHeader.kid, "KEY1234567");
check("issued by the team", secretBody.iss, "TEAM123456");
check("for our Apple client id", secretBody.sub, "a");
check("to Apple", secretBody.aud, "https://appleid.apple.com");
check(
  "and expires within six months",
  secretBody.exp - secretBody.iat <= 60 * 60 * 24 * 180,
  true,
);

/* ——— email_verified comes in two dialects ——— */

check("Google's boolean true counts", isVerified(true), true);
check("Apple's string \"true\" counts", isVerified("true"), true);
check("a false string does not", isVerified("false"), false);
check("a missing flag does not", isVerified(undefined), false);

/* ——— one email, one account ——— */

async function main() {
  // A throwaway store, so the demo data is never touched.
  const dbFile = process.env.DB_FILE ?? path.join(process.cwd(), ".data", "oauth-check.json");
  await fs.rm(dbFile, { force: true });

  const fresh = await signInWithIdentity({
    provider: "google",
    subject: "g-1",
    email: "Aoife@Example.com",
    emailVerified: true,
    name: "Aoife Byrne",
  });
  ok("a new identity creates an account", fresh.ok && fresh.created, JSON.stringify(fresh));
  check(
    "with the provider's name as the manager",
    fresh.ok ? fresh.user.manager : null,
    "Aoife Byrne",
  );
  check("and the email normalised to lower case", fresh.ok ? fresh.user.email : null, "aoife@example.com");
  check(
    "and the identity recorded",
    (await findUser(fresh.ok ? fresh.user.id : ""))?.identities?.length,
    1,
  );

  const again = await signInWithIdentity({
    provider: "google",
    subject: "g-1",
    email: "aoife@example.com",
    emailVerified: true,
  });
  ok("signing in again finds the same account", again.ok && fresh.ok && again.user.id === fresh.user.id);
  check("and reports it as neither created nor newly linked", [again.ok && again.created, again.ok && again.linked], [false, false]);

  const unverified = await signInWithIdentity({
    provider: "facebook",
    subject: "f-1",
    email: "new@example.com",
    emailVerified: false,
  });
  ok("an unverified email cannot sign in", !unverified.ok);
  check(
    "and no account is created for it",
    await findUserByEmail("new@example.com"),
    null,
  );

  const badEmail = await signInWithIdentity({
    provider: "google",
    subject: "g-2",
    email: "not-an-email",
    emailVerified: true,
  });
  ok("a junk email is refused", !badEmail.ok);

  // A player who entered with a card payment, now using Google with the same
  // address, lands on their existing entry instead of a second one.
  const existing = fresh.ok ? fresh.user : null;
  const viaApple = await signInWithIdentity({
    provider: "apple",
    subject: "a-1",
    email: "aoife@example.com",
    emailVerified: true,
  });
  ok("a second provider with the same verified email links, not duplicates", viaApple.ok && !viaApple.created);
  check("to the same account", viaApple.ok && viaApple.user.id, existing?.id);

  const held = await findUserByIdentity("apple", "a-1");
  ok("and is readable by the second provider", Boolean(held));

  // Someone else's browser must not be able to attach an identity that is
  // already held by another account.
  const other = await signInWithIdentity({
    provider: "google",
    subject: "g-9",
    email: "other@example.com",
    emailVerified: true,
    name: "Other Player",
  });
  ok("a second player has their own account", other.ok && other.created);
  const steal = other.ok
    ? await signInWithIdentity({
        provider: "apple",
        subject: "a-1",
        email: "other@example.com",
        emailVerified: true,
        currentUserId: other.user.id,
      })
    : null;
  ok("an identity cannot be moved between accounts", steal !== null && !steal.ok);
  check(
    "and it stays with its original owner",
    (await findUserByIdentity("apple", "a-1"))?.email,
    "aoife@example.com",
  );

  // Linking from a signed-in browser that has no social identity yet.
  const target = other.ok ? other.user : null;
  const linked = target
    ? await signInWithIdentity({
        provider: "facebook",
        subject: "f-2",
        email: "other@example.com",
        emailVerified: true,
        currentUserId: target.id,
      })
    : null;
  ok("a signed-in browser can add a provider", linked !== null && linked.ok && linked.linked);
  check(
    "without creating a second account",
    (await findUser(target?.id ?? ""))?.identities?.length,
    2,
  );

  // Facebook hands back an email that has to match an existing entry.
  const byEmail = target
    ? await signInWithIdentity({
        provider: "google",
        subject: "g-10",
        email: "OTHER@example.com",
        emailVerified: true,
        name: null,
      })
    : null;
  ok("a known email signs into the existing account", byEmail !== null && byEmail.ok && byEmail.user.id === target?.id);

  const anonymous = await signInWithIdentity({
    provider: "google",
    subject: "g-11",
    email: "nameless@example.com",
    emailVerified: true,
    name: null,
  });
  check(
    "a nameless provider gives a manager name from the email",
    anonymous.ok ? anonymous.user.manager : null,
    "nameless",
  );

  clearJwksCache();
  await fs.rm(dbFile, { force: true });

  console.log(`\n${checks - failures}/${checks} sign-in checks pass`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
