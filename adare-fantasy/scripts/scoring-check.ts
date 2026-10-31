/**
 * Scoring rules, asserted without a browser or a database.
 *
 *   npm run scoring:check
 *
 * The numbers here are the contract the leaderboard, the account breakdown and
 * the live page all share, so a change to `lib/scoring.ts` that moves them has
 * to be deliberate.
 */
import {
  cupFrom,
  cupFromPicks,
  round,
  PREDICT_POINTS,
  rankRows,
  scoreCard,
  scoreEntry,
  scorePredictions,
  type Results,
  type ScoredMatch,
} from "../lib/scoring";
import { autoPick, validateSquad } from "../lib/helpers";
import { PLAYERS } from "../lib/data";
import { checkTransfer, replacementsFor, transferState, windowAt } from "../lib/transfers";
import { scoringClock } from "../lib/server/clock";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const results: Results = {
  matches: [
    {
      id: "fri-am-1",
      no: 1,
      sessionId: "fri-am",
      format: "foursomes",
      europe: ["a", "b"],
      usa: ["c", "d"],
      result: "europe",
      events: [
        { playerId: "a", kind: "birdie" },
        { playerId: "c", kind: "eagle" },
      ],
    },
    {
      id: "sun-1",
      no: 26,
      sessionId: "sun",
      format: "singles",
      europe: ["a"],
      usa: ["c"],
      result: "half",
      events: [],
    },
    {
      id: "sun-2",
      no: 27,
      sessionId: "sun",
      format: "singles",
      europe: ["b"],
      usa: ["d"],
      result: "usa",
      events: [],
    },
    {
      id: "sun-3",
      no: 28,
      sessionId: "sun",
      format: "singles",
      europe: ["a"],
      usa: ["d"],
      result: "europe",
      events: [],
    },
  ] as ScoredMatch[],
  awards: { mvp: "a", topScorer: "c", rookie: null },
  cup: { europe: 2.5, usa: 1.5 },
  finals: 4,
  total: 4,
  updatedAt: new Date(0).toISOString(),
  source: "simulation",
};

const card = { squad: ["a", "b", "c", "d"], captain: "a", mode: "classic" as const };
const scored = scoreCard(card, results);
const byId = Object.fromEntries(scored.players.map((row) => [row.playerId, row]));

// a: foursomes win 5 (+1 appearance, +1 birdie) doubled as captain, then a
// halved singles 3 doubled, plus appearance, plus the unbeaten bonus.
check("captain's win is doubled and bonuses added", byId.a.total, 37);
check("captain keeps per-player counts", [byId.a.matches, byId.a.wins, byId.a.halves, byId.a.losses], [3, 2, 1, 0]);
check("unbeaten bonus applies after three matches", scored.unbeaten, ["a"]);
check("fourball/foursomes win is 5 plus appearance", byId.b.matchPoints + byId.b.bonusPoints, byId.b.total);
check("loser still gets the appearance point", byId.c.total, 9);
check("singles win is 6", byId.d.matchPoints, 6);
check("card total adds every player", scored.total, 37 + 7 + 9 + 9);
check("a twelve-man card is scaled by 0.9", scoreCard({ ...card, mode: "full" }, results).total, round(62 * 0.9));

const predictions = {
  predictions: { "fri-am-1": "europe", "sun-1": "europe", "sun-2": "usa", "sun-3": "usa" } as const,
  awards: { mvp: "a", topScorer: "c", rookie: "b" },
};
const predicted = scorePredictions(predictions, results);
check("each correct match is worth 2", predicted.matchHits, 2);
check("match points", predicted.matchPoints, 2 * PREDICT_POINTS.match);
check("only correct awards score", predicted.awardHits, ["mvp", "topScorer"]);
check("award points", predicted.awardPoints, 2 * PREDICT_POINTS.award);
check("wrong scoreline gets no bonus", predicted.exact, false);

const entry = scoreEntry(card, predictions, results);
check("entry total is card plus predictions", entry.total, scored.total + predicted.total);

// A perfect set of picks should also take the exact-scoreline bonus.
const perfect = {
  predictions: { "fri-am-1": "europe", "sun-1": "half", "sun-2": "usa", "sun-3": "europe" } as const,
  awards: { mvp: "a", topScorer: "c", rookie: null },
};
const perfectScore = scorePredictions(perfect, results);
check("perfect picks take the exact bonus", perfectScore.exact, true);
check("perfect prediction total", perfectScore.total, 4 * PREDICT_POINTS.match + 2 * PREDICT_POINTS.award + PREDICT_POINTS.exact);

// Cup maths: a win is 1, a half is 0.5 to each side.
check("cup from results", cupFrom(results.matches), { europe: 2.5, usa: 1.5 });
check("cup from picks", cupFromPicks({ a: "europe", b: "usa", c: "half" }), { europe: 1.5, usa: 1.5 });

// Unknown players and empty squads must not blow up.
const unknown = scoreCard({ squad: ["a", "ghost"], captain: "ghost", mode: "classic" }, results);
check("unknown players are ignored", unknown.players.length, 2);
check("empty card scores zero", scoreCard({ squad: [], captain: null, mode: "classic" }, results).total, 0);

// Ranking: equal totals share a rank and the next entry skips.
const ranked = rankRows([
  { entryId: "1", team: "A", manager: "a", card: 10, predictions: 0, total: 10, prizeEligible: true },
  { entryId: "2", team: "B", manager: "b", card: 8, predictions: 2, total: 10, prizeEligible: true },
  { entryId: "3", team: "C", manager: "c", card: 4, predictions: 0, total: 4, prizeEligible: false },
]);
check("ties share a rank", ranked.map((row) => row.rank), [1, 1, 3]);

// Mid-event, the exact bonus must not land even if the partial cup matches.
const partial = scorePredictions(perfect, { ...results, finals: 2, total: 28 });
check("no exact bonus before the cup is decided", partial.exact, false);


/* ——— v0.6: the armband by day, transfer penalties, the windows ——— */

// Two matches: Friday foursomes (a,b beat c,d) and Sunday singles (c beats a).
const dayResults: Results = {
  ...results,
  matches: [
    {
      id: "fri-am-1",
      no: 1,
      sessionId: "fri-am",
      format: "foursomes",
      europe: ["a", "b"],
      usa: ["c", "d"],
      result: "europe",
      events: [],
    },
    {
      id: "sun-1",
      no: 26,
      sessionId: "sun",
      format: "singles",
      europe: ["a"],
      usa: ["c"],
      result: "usa",
      events: [],
    },
  ],
  finals: 2,
  total: 2,
};

// Overall captain (a): Friday 5×2 + 1, Sunday 0 + 1 = 12; c = 1 + 7 = 8.
const overallCaptain = scoreCard({ squad: ["a", "c"], captain: "a", mode: "classic" }, dayResults);
check("overall captain doubles every day", [overallCaptain.total, overallCaptain.captainBonus], [20, 5]);

// Friday to a, Sunday to c: a = 11 + 1 = 12, c = 1 + (6×2 + 1) = 14.
const perDay = scoreCard(
  { squad: ["a", "c"], captain: "a", mode: "classic", sessionCaptains: { fri: "a", sun: "c" } },
  dayResults,
);
check("per-day armband moves the doubling", perDay.total, 26);
check("per-day captain bonus is reported", perDay.captainBonus, 11);
check("days with no pick fall back to the overall captain", perDay.sessionCaptains.fri, "a");

// An explicit null is a real choice: no armband that day.
const noSunday = scoreCard(
  { squad: ["a", "c"], captain: "a", mode: "classic", sessionCaptains: { fri: "a", sun: null } },
  dayResults,
);
check("a null day means nobody is doubled", noSunday.total, 20);
check("no Sunday armband leaves the Sunday points alone", noSunday.captainBonus, 5);

// Transfer penalties come off the total, not off the card.
const penalised = scoreEntry({ squad: ["a", "c"], captain: "a", mode: "classic" }, {}, dayResults, 8);
check("penalty is deducted from the net total", penalised.total, 20 - 8);
check("gross and penalty are both reported", [penalised.gross, penalised.transferPenalty], [20, 8]);

// Windows: between sessions only.
check("a window is open before the first tee", windowAt(-60)?.id, "pre");
check("the card is closed at the first tee", windowAt(0), null);
check("open again on Friday night", windowAt(600)?.id, "fri-sat");
check("closed on Saturday afternoon", windowAt(1800), null);
check("open again on Saturday night", windowAt(2400)?.id, "sat-sun");
check("closed once the singles start", windowAt(2900), null);
check("no window after the last match", windowAt(3300), null);

// The allowance: two free after the lock, then four points each. Edits made
// before the first tee are free and do not eat the allowance.
const state = transferState(
  {
    transfers: [
      { out: "a", in: "b", at: "", window: "pre", penalty: 0 },
      { out: "b", in: "a", at: "", window: "fri-sat", penalty: 0 },
      { out: "a", in: "b", at: "", window: "sat-sun", penalty: 4 },
    ],
  },
  2400,
);
check("pre-lock edits are counted separately", [state.preLock, state.used], [1, 2]);
check("one free change is left", [state.free, state.remainingFree], [2, 1]);
check("the next change is still free", state.cost, 0);
check("penalties paid are summed", state.penaltyPaid, 4);

const exhausted = transferState(
  {
    transfers: [
      { out: "a", in: "b", at: "", window: "fri-sat", penalty: 0 },
      { out: "b", in: "a", at: "", window: "fri-sat", penalty: 0 },
    ],
  },
  2400,
);
check("once the free ones are gone, a change costs four", [exhausted.remainingFree, exhausted.cost], [0, 4]);
check("a referral adds a free change", transferState({ transfers: [], bonusTransfers: 1 }, 2400).free, 3);
check("before the first tee everything is free", transferState({ transfers: [] }, -600).cost, 0);
check("before the first tee the card is open", transferState({}, -600).window?.id, "pre");

// Checking a swap: the clock, the card, and the budget all have a say.
const { squad: legalSquad } = autoPick("classic");
const outsider = PLAYERS.find((p) => !legalSquad.includes(p.id));
const closed = checkTransfer({
  squad: legalSquad,
  mode: "classic",
  out: legalSquad[0],
  in: outsider?.id ?? "",
  minute: 100,
  entry: {},
});
check("a swap during play is refused", closed.ok, false);
check("the reason names the window", /closed/i.test(closed.errors[0]), true);

const ghost = checkTransfer({
  squad: legalSquad,
  mode: "classic",
  out: legalSquad[0],
  in: "nobody",
  minute: 600,
  entry: {},
});
check("an unknown player is refused", ghost.ok, false);

const cheapIn = replacementsFor(legalSquad, "classic", legalSquad[0])[0];
const open = checkTransfer({
  squad: legalSquad,
  mode: "classic",
  out: legalSquad[0],
  in: cheapIn?.id ?? "",
  minute: 600,
  entry: {},
});
check("a legal swap in an open window is allowed", open.ok, true);
check("a legal swap costs nothing while free ones remain", open.penalty, 0);
check("the resulting card is still legal", validateSquad(open.squad, "classic"), []);

// The clock behind server scoring.
check("default clock scores the whole weekend", scoringClock(new Date(), {}).minute, 3300);
check(
  "a replay can pin the clock",
  scoringClock(new Date(), { SCORING_CLOCK: "at:1500" }).minute,
  1500,
);
check(
  "live mode counts minutes since the first tee",
  scoringClock(new Date("2027-09-17T09:35:00+01:00"), { SCORING_CLOCK: "live" }).minute,
  120,
);
check(
  "live mode never runs past the last putt",
  scoringClock(new Date("2028-01-01T00:00:00Z"), { SCORING_CLOCK: "live" }).minute,
  3300,
);

console.log(`\n${checks - failures}/${checks} scoring checks pass`);
if (failures > 0) process.exitCode = 1;
