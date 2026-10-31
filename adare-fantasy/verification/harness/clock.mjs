/**
 * The card clock, end to end.
 *
 *   SCORING_CLOCK=at:600 npm start          # in the app directory
 *   BASE=http://127.0.0.1:3000 node clock.mjs
 *
 * The main suites run against the demo clock, which sits in the pre-lock
 * window where every change is free. This script exercises the other half of
 * the rule set on a server whose clock is inside the Friday-night window:
 * transfers open, the allowance spent, the fourth change charged four points,
 * and the penalty visible on the score and on the table.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const call = async (route, { method = "GET", body, cookie } = {}) => {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), cookie: (res.headers.getSetCookie?.() ?? [])[0]?.split(";")[0] ?? "" };
};

const email = `clock+${Date.now()}@example.com`;
const session = await call("/api/session", {
  method: "POST",
  body: { email, manager: "Clock Runner", teamName: "Window FC" },
});
const cookie = session.cookie;

const order = await call("/api/checkout", { method: "POST", cookie, body: { planId: "single" } });
await call(`/api/orders/${order.json?.order?.ref}/confirm`, { method: "POST", cookie });
await call("/api/entry", {
  method: "PUT",
  cookie,
  body: {
    mode: "classic",
    squad: ["scheffler", "rory", "schauffele", "rahm", "aberg", "hovland"],
    captain: "rory",
    sessionCaptains: { fri: "rory", sat: "schauffele", sun: null },
  },
});

let r = await call("/api/entry/transfer", { cookie });
check("the window is open between sessions", r.json?.state?.open === true && r.json?.state?.window?.id === "fri-sat", JSON.stringify(r.json?.state?.window));
check("two free changes are available", r.json?.state?.free === 2 && r.json?.state?.remainingFree === 2, `${r.json?.state?.free} free`);

let penaltyPaid = 0;
let swaps = 0;
for (let i = 0; i < 3; i += 1) {
  const card = (await call("/api/entry/transfer", { cookie })).json;
  const out = card?.squad?.[0]?.id;
  const into = card?.options?.[out]?.[0]?.id;
  if (!out || !into) break;
  const swap = await call("/api/entry/transfer", { method: "POST", cookie, body: { out, in: into } });
  if (swap.status !== 200) {
    check(`change ${i + 1} goes through`, false, `${swap.status} ${swap.json?.error}`);
    break;
  }
  penaltyPaid += swap.json?.penalty ?? 0;
  swaps += 1;
}

check("three changes are allowed inside a window", swaps === 3, `${swaps} swaps`);
check("the first two are free and the third costs four", penaltyPaid === 4, `paid ${penaltyPaid}`);

r = await call("/api/entry/transfer", { cookie });
check("the allowance is spent", r.json?.state?.remainingFree === 0 && r.json?.state?.cost === 4, `${r.json?.state?.remainingFree} left, next ${r.json?.state?.cost}`);
check("every change is in the history with its price",
  (r.json?.transfers ?? []).length === 3 && (r.json?.transfers ?? []).filter((t) => t.penalty === 4).length === 1,
  JSON.stringify((r.json?.transfers ?? []).map((t) => `${t.out}->${t.in} ${t.penalty}`)));

r = await call("/api/score", { cookie });
check("the penalty comes off the total, not the card",
  r.json?.score?.transferPenalty === 4 &&
    Math.abs(r.json.score.total - (r.json.score.gross - 4)) < 0.001,
  `gross ${r.json?.score?.gross}, net ${r.json?.score?.total}`);

r = await call("/api/leaderboard");
const row = (r.json?.rows ?? []).find((x) => x.team === "Window FC");
check("the table shows the penalty on the row", row?.penalty === 4, `${row?.penalty}`);
check("the table scores only what is finished at this minute",
  r.json?.results?.finals === 8 && r.json?.results?.provisional === true,
  `${r.json?.results?.finals}/${r.json?.results?.total} at minute ${r.json?.results?.minute}`);

const passed = results.filter((x) => x.pass).length;
const out = process.env.OUT ?? path.join(process.cwd(), "run");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "clock-results.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} clock checks pass`);
if (passed !== results.length) process.exitCode = 1;
