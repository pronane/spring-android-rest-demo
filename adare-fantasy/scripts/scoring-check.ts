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

console.log(`\n${checks - failures}/${checks} scoring checks pass`);
if (failures > 0) process.exitCode = 1;
