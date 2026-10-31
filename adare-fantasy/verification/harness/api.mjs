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

const call = async (route, { method = "GET", body, cookie } = {}) => {
  const res = await fetch(BASE + route, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
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

const passed = results.filter((x) => x.pass).length;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "api-results.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} API checks pass`);
if (passed !== results.length) process.exitCode = 1;
