/**
 * Contract checks against a running server. Covers the paths that matter for
 * money and for account safety: auth, the paid gate, plan validation, card
 * validation, sanitising and the takeover guard.
 *
 *   BASE=http://127.0.0.1:3000 node api.mjs
 *
 * Exits non-zero on the first failing suite result. Writes api-results.json.
 */
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
    body: body ? JSON.stringify(body) : undefined,
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
check("checkout issues a receipt ref", r.status === 200 && /^TE-[A-Z0-9]{6}-ADRE$/.test(r.json?.entry?.ref ?? ""), r.json?.entry?.ref);

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

const passed = results.filter((x) => x.pass).length;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "api-results.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} API checks pass`);
if (passed !== results.length) process.exitCode = 1;
