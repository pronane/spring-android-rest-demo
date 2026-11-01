/**
 * Contract checks against a running server. Covers the paths that matter for
 * money and for account safety: auth, the paid gate, plan validation, card
 * validation, sanitising and the takeover guard.
 *
 *   BASE=http://127.0.0.1:3000 node api.mjs
 *
 * Exits non-zero on the first failing suite result. Writes api-results.json.
 */
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = process.env.OUT ?? path.join(process.cwd(), "run");
const results = [];

const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const call = async (route, { method = "GET", body, cookie, headers = {} } = {}) => {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    // Raw strings (webhook payloads) must not be re-encoded: the signature covers bytes.
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, cookie: (res.headers.getSetCookie?.() ?? [])[0]?.split(";")[0] ?? "" };
};

const email = `api+${Date.now()}@example.com`;
let cookie = "";
let r;

r = await call("/api/session", { method: "POST", body: { email: "nope" } });
check("invalid email rejected", r.status === 400, `status ${r.status}`);

r = await call("/api/session", { method: "POST", body: { email, manager: "Api Runner", teamName: "Contract FC" } });
cookie = r.cookie;
check("account created with a session cookie", r.status === 200 && Boolean(cookie), `status ${r.status}`);

r = await call("/api/session", { method: "POST", body: { email } });
check("takeover blocked without the session", r.status === 409, `status ${r.status}`);

r = await call("/api/entry", { method: "PUT", body: { mode: "classic", squad: [] } });
check("unauthenticated write rejected", r.status === 401, `status ${r.status}`);

r = await call("/api/entry", {
  method: "PUT",
  cookie,
  body: { mode: "classic", squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka"], captain: "rory" },
});
check("unpaid write rejected", r.status === 402, `status ${r.status}`);

r = await call("/api/checkout", { method: "POST", cookie, body: { planId: "free" } });
check("unknown plan rejected", r.status === 400, `status ${r.status}`);

r = await call("/api/checkout", { method: "POST", cookie, body: { planId: "single" } });
const orderRef = r.json?.order?.ref ?? "";
check("checkout opens a pending order", r.status === 200 && r.json?.order?.status === "pending" && /^ORD-[A-Z0-9]{6}$/.test(orderRef), `${r.status} ${orderRef}`);
check("checkout returns a payment url", typeof r.json?.url === "string" && r.json.url.length > 0, r.json?.url);
check("checkout takes no entry of its own", !r.json?.entry, JSON.stringify(r.json?.entry ?? null));

r = await call("/api/entry", {
  method: "PUT",
  cookie,
  body: { mode: "classic", squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka"], captain: "rory" },
});
check("a pending order does not unlock the game", r.status === 402, `status ${r.status}`);

r = await call(`/api/orders/${orderRef}/confirm`, { method: "POST", cookie });
check("demo payment settles the order", r.status === 200 && r.json?.order?.status === "paid" && /^TE-[A-Z0-9]{6}-ADRE$/.test(r.json?.entry?.ref ?? ""), `${r.status} ${r.json?.entry?.ref}`);

r = await call(`/api/orders/${orderRef}/confirm`, { method: "POST", cookie });
check("re-confirming a paid order is idempotent", r.status === 200 && r.json?.alreadyPaid === true, `alreadyPaid ${r.json?.alreadyPaid}`);

r = await call(`/api/orders/${orderRef}`, { cookie });
check("the owner can read the order", r.status === 200 && r.json?.order?.status === "paid", `status ${r.status}`);

r = await call(`/api/orders/${orderRef}`);
check("order status needs a session", r.status === 401, `status ${r.status}`);

r = await call(`/api/orders/ORD-000000`, { cookie });
check("an unknown order is a 404", r.status === 404, `status ${r.status}`);

const rawCookie = await fetch(BASE + "/api/session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `flags+${Date.now()}@example.com` }),
});
const setCookie = (rawCookie.headers.getSetCookie?.() ?? [])[0] ?? "";
check("session cookie is httpOnly + SameSite", /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), setCookie.split(";").slice(1).join(";").trim());

const DOZEN = ["rory", "rahm", "aberg", "hovland", "lowry", "macintyre", "scheffler", "schauffele", "dechambeau", "morikawa", "thomas", "henley"];
r = await call("/api/entry", {
  method: "PUT",
  cookie,
  body: {
    mode: "full",
    squad: DOZEN,
    captain: "rory",
    predictions: { "fri-am-1": "europe", bogus: "europe", "fri-am-2": "draw" },
    awards: { mvp: "rory", topScorer: "ghost", rookie: 7 },
  },
});
check("valid twelve-player card saves", r.status === 200, `status ${r.status}`);
check("unknown match ids dropped", Object.keys(r.json?.user?.entry?.predictions ?? {}).join(",") === "fri-am-1", JSON.stringify(r.json?.user?.entry?.predictions));
check("invalid awards nulled", r.json?.user?.entry?.awards?.topScorer === null && r.json?.user?.entry?.awards?.rookie === null);

r = await call("/api/entry", { method: "PUT", cookie, body: { mode: "classic", squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "ghost"], captain: "rory" } });
check("unknown player id rejected", r.status === 422, `${r.status}: ${r.json?.error}`);

r = await call("/api/entry", { method: "PUT", cookie, body: { mode: "classic", squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka", "rahm"], captain: "rory" } });
check("wrong squad size rejected", r.status === 422, `${r.status}: ${r.json?.error}`);

r = await call("/api/entry", { method: "PUT", cookie, body: { mode: "classic", squad: ["scheffler", "rory", "schauffele", "rahm", "aberg", "dechambeau"], captain: "rory" } });
check("over-budget card rejected", r.status === 422, `${r.status}: ${r.json?.error}`);

r = await call("/api/entry", { method: "PUT", cookie, body: { mode: "classic", squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka"], captain: "rahm" } });
check("captain must be on the card", r.status === 422, `${r.status}: ${r.json?.error}`);

r = await call("/api/entry", { method: "PUT", cookie: cookie.slice(0, -2) + "zz", body: { mode: "classic", squad: ["rory"], captain: "rory" } });
check("tampered cookie rejected", r.status === 401, `status ${r.status}`);

r = await call("/api/session", { cookie });
check("session returns the saved card", r.json?.user?.entry?.squad?.length === 12 && r.json?.user?.entry?.captain === "rory", `${r.json?.user?.entry?.squad?.length} players`);

/* ——— private leagues, sign-in links, live feed ——— */

r = await call("/api/leagues", { method: "POST", body: { name: "No Session" } });
check("league creation needs a session", r.status === 401, `status ${r.status}`);

r = await call("/api/leagues", { method: "POST", cookie, body: { name: "Harness League", buyIn: 20 } });
const leagueCode = r.json?.league?.code ?? "";
check("league is created with a join code", r.status === 201 && /^[A-Z]{3}[A-Z0-9]{3}$/.test(leagueCode), `${r.status} ${leagueCode}`);
const leagueId = r.json?.league?.id;

r = await call("/api/leagues", { cookie });
check("league list includes the new league", r.json?.leagues?.some((l) => l.id === leagueId) === true, `${r.json?.leagues?.length} leagues`);

r = await call("/api/leagues/join", { method: "POST", cookie, body: { code: leagueCode } });
check("joining your own league is refused", r.status === 404 && /already/i.test(r.json?.error ?? ""), `${r.status}: ${r.json?.error}`);

r = await call("/api/leagues/join", { method: "POST", cookie, body: { code: "ZZZZ9" } });
check("unknown join code is refused", r.status >= 400, `${r.status}: ${r.json?.error}`);

r = await call(`/api/leagues/${leagueId}`, { method: "DELETE", cookie });
check("leaving drops the league", r.status === 200, `status ${r.status}`);

r = await call("/api/session/link", { method: "POST", body: { email: "nobody@example.com" } });
check("sign-in link does not reveal whether an email has an entry",
  r.status === 200 && r.json?.ok === true && !r.json?.devLink, `${r.status} devLink=${Boolean(r.json?.devLink)}`);

r = await call("/api/session/link", { method: "POST", body: { email } });
check("sign-in link is not echoed in production", r.status === 200 && !r.json?.devLink, `status ${r.status}`);

r = await call("/api/live");
check("live endpoint falls back to the simulation without a feed", r.status === 200 && r.json?.source === "simulation", r.json?.source);

/* ——— scoring engine, standings, operator corrections ——— */

r = await call("/api/score");
check("score endpoint needs a session", r.status === 401, `status ${r.status}`);

r = await call("/api/score", { cookie });
check("score returns a breakdown for the saved card",
  r.status === 200 && typeof r.json?.score?.total === "number" && Array.isArray(r.json?.score?.card?.players),
  `total ${r.json?.score?.total}`);

r = await call("/api/leaderboard");
const boardRows = r.json?.rows ?? [];
check("global table scores every card server-side",
  r.status === 200 && boardRows.length > 0 && boardRows.every((row) => typeof row.total === "number"),
  `${boardRows.length} rows`);
check("global table ranks in order", boardRows.every((row, i) => i === 0 || row.total <= boardRows[i - 1].total), JSON.stringify(boardRows.map((x) => x.total)));
check("results snapshot covers the whole cup", r.json?.results?.finals === r.json?.results?.total, `${r.json?.results?.finals}/${r.json?.results?.total}`);
check("card and predictor add up to the total",
  boardRows.every((row) => Math.abs(row.card + row.predictions - row.total) < 0.001), "row totals consistent");

r = await call("/api/leagues", { method: "POST", cookie, body: { name: "Scoring League" } });
const scoreLeagueId = r.json?.league?.id;
r = await call(`/api/leaderboard?league=${scoreLeagueId}`, { cookie });
check("league table only scores that league", r.status === 200 && r.json?.rows?.length === 1 && r.json?.scope?.kind === "league", `${r.json?.rows?.length} rows`);

r = await call("/api/leaderboard?league=00000000-0000-0000-0000-000000000000", { cookie });
check("league you are not in is refused", r.status === 404, `status ${r.status}`);

if (process.env.ADMIN_TOKEN) {
  r = await call("/api/admin/results", { headers: { authorization: "Bearer wrong-token" } });
  check("admin corrections reject a bad token", r.status === 401, `status ${r.status}`);

  const auth = { authorization: `Bearer ${process.env.ADMIN_TOKEN}` };
  r = await call("/api/admin/results", {
    method: "POST",
    headers: auth,
    body: { matches: { "fri-am-1": { result: "usa" }, "ghost-match": { result: "europe" } }, awards: { mvp: "rory" } },
  });
  check("operator correction applies and drops unknown matches",
    r.status === 200 && r.json?.applied === 1 && (r.json?.dropped ?? []).includes("ghost-match"),
    `applied ${r.json?.applied}, dropped ${JSON.stringify(r.json?.dropped)}`);

  const after = await call("/api/leaderboard");
  check("table re-scores from the correction", after.json?.results?.source === "mixed", after.json?.results?.source);

  r = await call("/api/admin/results", { method: "DELETE", headers: auth });
  const cleared = await call("/api/leaderboard");
  check("clearing corrections returns to the simulation",
    r.status === 200 && cleared.json?.results?.source === "simulation", cleared.json?.results?.source);
} else {
  r = await call("/api/admin/results");
  check("admin corrections fail closed without ADMIN_TOKEN", r.status === 503, `status ${r.status}`);
}

/* ——— payments, ledger and prizes ——— */

r = await call("/api/webhooks/stripe", { method: "POST", body: {} });
if (process.env.STRIPE_WEBHOOK_SECRET) {
  check("a webhook with no signature is refused", r.status === 400, `status ${r.status}`);

  const event = JSON.stringify({
    id: `evt_${Date.now()}`,
    type: "checkout.session.completed",
    data: { object: { id: "cs_harness", payment_status: "paid", metadata: { orderRef } } },
  });
  const stale = Math.floor(Date.now() / 1000) - 400;
  const staleSig = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${stale}.${event}`).digest("hex");
  r = await call("/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": `t=${stale},v1=${staleSig}` },
    body: event,
  });
  check("a replayed webhook is refused", r.status === 400, `status ${r.status}`);

  const now = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${now}.${event}`).digest("hex");
  r = await call("/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": `t=${now},v1=${sig}` },
    body: event,
  });
  check("a valid webhook cannot settle a demo order",
    r.status === 200 && r.json?.action === "ignored" && /demo/.test(r.json?.why ?? ""),
    `${r.status} ${r.json?.action} ${r.json?.why ?? ""}`);

  r = await call("/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
    body: event,
  });
  check("a forged signature is refused", r.status === 400, `status ${r.status}`);
} else {
  check("webhooks fail closed without STRIPE_WEBHOOK_SECRET", r.status === 503, `status ${r.status}`);
}

/* ——— v0.6: transfers, the armband, referrals, share cards, live snapshots ——— */

r = await call("/api/entry/transfer");
check("the transfer page needs a session", r.status === 401, `status ${r.status}`);

r = await call("/api/entry/transfer", { cookie });
const card = r.json;
check("the saved card is readable with the transfer rules attached",
  r.status === 200 && card?.squad?.length === 12 && card?.state?.free >= 2,
  `${card?.squad?.length} players, ${card?.state?.free} free`);

const dropId = card?.squad?.[0]?.id ?? "";
const incoming = card?.options?.[dropId]?.[0]?.id ?? "";
check("a replacement is offered for every player on the card", Boolean(incoming), `${dropId} → ${incoming}`);

r = await call("/api/entry/transfer", { method: "PUT", cookie, body: { fri: "ghost" } });
check("the armband must go to a player on the card", r.status === 422, `${r.status}: ${r.json?.error}`);

r = await call("/api/entry/transfer", { method: "PUT", cookie, body: { fri: dropId, sun: null } });
check("the armband can be set per day", r.status === 200 && r.json?.sessionCaptains?.fri === dropId && r.json?.sessionCaptains?.sun === null, JSON.stringify(r.json?.sessionCaptains));

r = await call("/api/score", { cookie });
const withArmband = r.json?.score;
check("the per-day armband is scored", withArmband?.card?.sessionCaptains?.fri === dropId, JSON.stringify(withArmband?.card?.sessionCaptains));
check("the armband shows what doubling was worth", typeof withArmband?.card?.captainBonus === "number", `${withArmband?.card?.captainBonus}`);

r = await call("/api/entry/transfer", { method: "POST", cookie, body: { out: dropId, in: "ghost" } });
check("a transfer to an unknown player is refused", r.status === 422, `${r.status}: ${r.json?.error}`);

r = await call("/api/entry/transfer", { method: "POST", cookie, body: { out: dropId, in: incoming } });
const transferred = r.json;
check("a legal transfer swaps the squad", r.status === 200 && transferred?.squad?.some((p) => p.id === incoming) && !transferred?.squad?.some((p) => p.id === dropId), `${dropId} → ${incoming}`);
check("a transfer before the first tee is free", transferred?.penalty === 0 && transferred?.state?.remainingFree === card?.state?.free, `penalty ${transferred?.penalty}`);
check("the transfer is recorded with its window", transferred?.transfers?.length === 1 && transferred?.transfers?.[0]?.window === "pre", JSON.stringify(transferred?.transfers?.[0] ?? null));

r = await call("/api/entry/transfer", { method: "POST", cookie, body: { out: dropId, in: incoming } });
check("the same player cannot be swapped out twice", r.status === 422, `${r.status}: ${r.json?.error}`);

// Referrals: the entry ref is the invite code, and both cards get a free change.
r = await call("/api/referral", { cookie });
const inviteCode = r.json?.code ?? "";
check("an entry has an invite code", /^TE-[A-Z0-9]{6}-ADRE$/.test(inviteCode), inviteCode);
check("the invite link points at the entry page", r.json?.link === `/enter?ref=${inviteCode}`, r.json?.link);

const friendEmail = `friend+${Date.now()}@example.com`;
const friend = await call("/api/session", { method: "POST", body: { email: friendEmail, manager: "Invited Player", teamName: "Guest Card" } });
const friendCookie = friend.cookie;
const friendOrder = await call("/api/checkout", {
  method: "POST",
  cookie: friendCookie,
  body: { planId: "single", referralCode: inviteCode },
});
const friendRef = friendOrder.json?.order?.ref ?? "";
await call(`/api/orders/${friendRef}/confirm`, { method: "POST", cookie: friendCookie });

r = await call("/api/referral", { cookie: friendCookie });
check("the invited player is credited a free transfer on top of the two",
  r.status === 200 && r.json?.bonusTransfers === 1 && r.json?.referredBy === inviteCode,
  `${r.json?.bonusTransfers} bonus, by ${r.json?.referredBy}`);

r = await call("/api/referral", { cookie });
check("the inviter is credited too", r.json?.invited >= 1 && r.json?.bonusTransfers === 1, `${r.json?.invited} invited, ${r.json?.bonusTransfers} bonus`);

r = await call("/api/referral", { method: "POST", cookie, body: { code: inviteCode } });
check("an invite cannot be claimed twice", r.status === 409, `${r.status}: ${r.json?.error}`);

r = await call("/api/referral", { method: "POST", cookie, body: { code: "TE-NOPE00-ADRE" } });
check("an invented invite code is refused", r.status === 404, `${r.status}: ${r.json?.error}`);

// The public card and its preview image.
const shareRes = await fetch(`${BASE}/t/${inviteCode}`);
const shareHtml = await shareRes.text();
check("a public card renders for a paid entry", shareRes.status === 200 && shareHtml.includes("Contract FC"), `status ${shareRes.status}`);
check("the public card carries share metadata", /og:title/.test(shareHtml) && /og:image/.test(shareHtml), "og tags present");
const ogRes = await fetch(`${BASE}/t/${inviteCode}/opengraph-image`);
check("the share image is a real png", ogRes.status === 200 && ogRes.headers.get("content-type")?.includes("image/png") === true, `${ogRes.status} ${ogRes.headers.get("content-type")}`);

r = await fetch(`${BASE}/t/TE-NOPE00-ADRE`);
check("an unknown card is a 404", r.status === 404, `status ${r.status}`);

// A snapshot of the weekend at a given minute: only finished matches score.
r = await call("/api/leaderboard?at=600");
const early = r.json;
check("a replay scores only the matches finished by then",
  early?.results?.finals === 8 && early?.results?.provisional === true,
  `${early?.results?.finals} finished, provisional ${early?.results?.provisional}`);
check("the replay names the session", /Fri 17 Sep \u00b7 Fourball/.test(early?.results?.clock ?? ""), early?.results?.clock);
check("the replay ranks the same entries differently", early?.rows?.every((row) => row.total <= (boardRows.find((b) => b.entryId === row.entryId)?.total ?? Infinity)), `${early?.rows?.length} rows`);

r = await call("/api/leaderboard?at=0");
check("before the first tee there are no points", r.json?.results?.finals === 0 && (r.json?.rows ?? []).every((row) => row.total === 0), `${r.json?.results?.finals} finished`);

if (process.env.ADMIN_TOKEN) {
  const auth = { authorization: `Bearer ${process.env.ADMIN_TOKEN}` };

  r = await call("/api/admin/orders", { headers: auth });
  const money = r.json?.money ?? {};
  check("the ledger knows what was taken and what was pooled",
    r.status === 200 && money.grossCents >= 1000 && money.poolCents === money.grossCents - money.feeCents,
    `gross ${money.grossCents}, fee ${money.feeCents}, pool ${money.poolCents}`);
  check("the order list shows the settled order",
    (r.json?.orders ?? []).some((order) => order.ref === orderRef && order.status === "paid"),
    `${(r.json?.orders ?? []).length} orders`);

  r = await call("/api/admin/prizes", { headers: auth });
  check("the prize board starts from the paid pot", r.status === 200 && r.json?.potCents >= 950, `pot ${r.json?.potCents}`);

  // The entry bought above plays in a league, so its fee funds that league's pot.
  r = await call("/api/admin/prizes", { method: "POST", headers: auth, body: { action: "settle", leagueId: scoreLeagueId } });
  const awards = r.json?.awards ?? [];
  check("settling awards the podium from the table", r.status === 200 && awards.length > 0 && awards[0].label === "1st overall", `${r.status} ${awards.length} awards ${r.json?.potCents ?? ""}`);
  check("no award is larger than the pot", awards.every((award) => award.amountCents <= (r.json?.potCents ?? 0)), "awards inside the pot");

  r = await call("/api/admin/prizes", { method: "POST", headers: auth, body: { action: "pay", leagueId: scoreLeagueId } });
  check("prizes can be marked paid", r.status === 200 && (r.json?.awards ?? []).every((award) => award.status === "paid"), `${(r.json?.awards ?? []).length} paid`);

  r = await call("/api/admin/prizes", { method: "POST", headers: auth, body: { action: "settle", leagueId: scoreLeagueId } });
  check("a paid pot cannot be settled twice", r.status === 409, `status ${r.status}`);

  // A second buyer, so the refund does not disturb the entry used above.
  const buyerEmail = `refund+${Date.now()}@example.com`;
  const buyer = await call("/api/session", { method: "POST", body: { email: buyerEmail } });
  const buyerCookie = buyer.cookie;
  const buyerOrder = await call("/api/checkout", { method: "POST", cookie: buyerCookie, body: { planId: "season" } });
  const buyerRef = buyerOrder.json?.order?.ref ?? "";
  check("a season pass costs €24 and pools 95%", buyerOrder.json?.order?.amountCents === 2400, `${buyerOrder.json?.order?.amountCents} cents`);
  await call(`/api/orders/${buyerRef}/confirm`, { method: "POST", cookie: buyerCookie });

  const beforeRefund = await call("/api/admin/orders", { headers: auth });
  r = await call("/api/admin/orders", { method: "POST", headers: auth, body: { ref: buyerRef, action: "refund" } });
  check("an operator can refund an order", r.status === 200 && r.json?.order?.status === "refunded" && r.json?.prizeEligible === false, `${r.status} ${r.json?.order?.status}`);

  const afterRefund = await call("/api/admin/orders", { headers: auth });
  const grossBefore = beforeRefund.json?.money?.grossCents ?? 0;
  const grossAfter = afterRefund.json?.money?.grossCents ?? 0;
  check("a refund comes back out of the pool",
    grossBefore - grossAfter === 2400,
    `gross ${grossBefore} → ${grossAfter}`);
}


// Social sign-in: the provider list is the single source of truth for the
// buttons, and an unconfigured provider must fail closed rather than 500.
// Redirects are not followed here — the Location is the thing under test.
const redirect = async (route) => {
  const res = await fetch(BASE + route, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") ?? "", cookie: (res.headers.getSetCookie?.() ?? [])[0]?.split(";")[0] ?? "" };
};

r = await call("/api/auth/providers");
const offered = r.json?.providers ?? null;
check(
  "the provider list answers with what it can offer",
  r.status === 200 && Array.isArray(offered),
  `${r.status} ${Array.isArray(offered) ? offered.length + " enabled" : "no list"}`,
);
check(
  "every offered provider has a label for its button",
  Array.isArray(offered) && offered.every((p) => ["google", "apple", "facebook"].includes(p.id) && Boolean(p.label)),
  (offered ?? []).map((p) => p.id).join(", ") || "none configured",
);

r = await call("/api/auth/nope/start");
check("an unknown provider cannot be started", r.status === 404, `status ${r.status}`);

const unconfigured = ["google", "apple", "facebook"].filter((id) => !(offered ?? []).some((p) => p.id === id));
if (unconfigured.length > 0) {
  r = await call(`/api/auth/${unconfigured[0]}/start`);
  check("an unconfigured provider cannot be started", r.status === 404, `status ${r.status}`);
  check("and hands out no state cookie", r.cookie === "", r.cookie || "no cookie");
  const back = await redirect(`/api/auth/${unconfigured[0]}/callback?code=x&state=y`);
  check(
    "its callback lands on the account page with a reason",
    back.status === 303 && back.location.includes("/account?signin=error&reason="),
    `${back.status} ${back.location}`,
  );
} else {
  // Everything is configured: start must set the state cookie and go to the
  // provider, and must never honour a host the caller names as `next`.
  const started = await redirect("/api/auth/google/start?next=//evil.example");
  const target = new URL(started.location || "http://invalid");
  check(
    "start sets a state cookie and redirects to the provider",
    started.status === 303 && started.cookie.startsWith("te_oauth=") && target.host === "accounts.google.com",
    `${started.status} ${target.host}`,
  );
  const payload = JSON.parse(Buffer.from(started.cookie.split("=")[1].split(".")[0], "base64url").toString("utf8"));
  check("an absolute next is clamped to the account page", payload.next === "/account", payload.next);
  check("the state cookie carries PKCE and a nonce", Boolean(payload.verifier) && Boolean(payload.nonce), "verifier + nonce");
}

const empty = await redirect("/api/auth/google/callback");
check(
  "a callback with no state or code fails closed",
  empty.status === 303 ? empty.location.includes("signin=error") : empty.status === 404,
  `${empty.status} ${empty.location}`,
);

const passed = results.filter((x) => x.pass).length;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "api-results.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} API checks pass`);
if (passed !== results.length) process.exitCode = 1;
