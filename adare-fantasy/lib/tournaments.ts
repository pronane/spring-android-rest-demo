/**
 * Twenty-Eight is the platform; each Ryder Cup is an "edition" it re-skins for.
 * Adding a venue = adding one object here plus a field snapshot.
 */

export type EditionStatus = "open" | "upcoming" | "archive";

export type Edition = {
  id: string;
  name: string;
  year: number;
  venue: string;
  village: string;
  country: string;
  matchesLabel: string;
  weekLabel: string;
  editionLabel?: string;
  firstTee: string;
  status: EditionStatus;
  /** Card accent, used by the edition switcher so each venue feels different. */
  accent: string;
  captains: { europe: string; usa: string };
  result?: string;
  blurb: string;
  fieldReady: boolean;
  /** Wikimedia entity used by the free data refresh script. */
  wikidata?: string;
  coords?: { lat: number; lon: number };
};

export const PLATFORM = {
  name: "Twenty-Eight",
  mark: "28",
  tagline: "Cup fantasy, properly scored.",
  description:
    "Draft a side, predict all 28 matches, and follow the cup live — one platform, every Ryder Cup.",
  support: "hello@twenty-eight.golf",
  domain: "twenty-eight.golf",
};

export const EDITIONS: Edition[] = [
  {
    id: "adare-2027",
    name: "Adare 2027",
    year: 2027,
    venue: "Adare Manor",
    village: "Adare, Co. Limerick",
    country: "Ireland",
    matchesLabel: "17–19 September 2027",
    weekLabel: "13–19 September 2027",
    editionLabel: "46th Ryder Cup · 100th anniversary",
    firstTee: "2027-09-17T07:35:00+01:00",
    status: "open",
    accent: "#c9a44c",
    captains: { europe: "Luke Donald", usa: "Jim Furyk" },
    blurb:
      "The 46th Ryder Cup and the 100th anniversary of the matches. Ireland's first staging since 2006.",
    fieldReady: false,
    wikidata: "Q136488386",
    coords: { lat: 52.5636, lon: -8.7894 },
  },
  {
    id: "hazeltine-2029",
    name: "Hazeltine 2029",
    year: 2029,
    venue: "Hazeltine National",
    village: "Chaska, Minnesota",
    country: "United States",
    matchesLabel: "September 2029",
    weekLabel: "September 2029",
    firstTee: "2029-09-21T08:00:00-05:00",
    status: "upcoming",
    accent: "#6f9bea",
    captains: { europe: "To be named", usa: "To be named" },
    blurb:
      "The 2016 host returns. Registration opens the week the qualifying lists go live.",
    fieldReady: false,
  },
  {
    id: "camiral-2031",
    name: "Camiral 2031",
    year: 2031,
    venue: "Camiral Golf & Wellness",
    village: "Costa Brava, Catalonia",
    country: "Spain",
    matchesLabel: "September 2031",
    weekLabel: "September 2031",
    firstTee: "2031-09-19T08:00:00+02:00",
    status: "upcoming",
    accent: "#e0776a",
    captains: { europe: "To be named", usa: "To be named" },
    blurb:
      "A return to Spain for the first time since 1997 was awarded here — a stadium course cut through pine.",
    fieldReady: false,
  },
  {
    id: "bethpage-2025",
    name: "Bethpage 2025",
    year: 2025,
    venue: "Bethpage Black",
    village: "Farmingdale, New York",
    country: "United States",
    matchesLabel: "26–28 September 2025",
    weekLabel: "23–28 September 2025",
    firstTee: "2025-09-26T07:30:00-04:00",
    status: "archive",
    accent: "#86c9a1",
    captains: { europe: "Luke Donald", usa: "Keegan Bradley" },
    result: "Europe 15–13 USA",
    blurb:
      "Europe's first away win since Medinah. The archive keeps the full card, all 28 results and the final table.",
    fieldReady: true,
  },
  {
    id: "rome-2023",
    name: "Rome 2023",
    year: 2023,
    venue: "Marco Simone",
    village: "Guidonia, Rome",
    country: "Italy",
    matchesLabel: "29 Sep – 1 Oct 2023",
    weekLabel: "25 Sep – 1 Oct 2023",
    firstTee: "2023-09-29T07:35:00+02:00",
    status: "archive",
    accent: "#c9a44c",
    captains: { europe: "Luke Donald", usa: "Zach Johnson" },
    result: "Europe 16½–11½ USA",
    blurb: "The Rome blowout. A 4-0 opening session set up a record home win.",
    fieldReady: true,
  },
];

export const ACTIVE_EDITION_ID = "adare-2027";
export const ACTIVE_EDITION =
  EDITIONS.find((e) => e.id === ACTIVE_EDITION_ID) ?? EDITIONS[0];

export function editionById(id: string): Edition {
  return EDITIONS.find((e) => e.id === id) ?? ACTIVE_EDITION;
}

/* ——— Game modes ——— */

export type ModeId = "classic" | "full";

export type ModeConfig = {
  id: ModeId;
  name: string;
  short: string;
  tagline: string;
  squadSize: number;
  budget: number;
  maxPerSide: number;
  blurb: string;
};

export const MODES: Record<ModeId, ModeConfig> = {
  classic: {
    id: "classic",
    name: "Classic Six",
    short: "Classic",
    tagline: "Six picks, ninety seconds",
    squadSize: 6,
    budget: 100,
    maxPerSide: 4,
    blurb:
      "Six players, 100m credits, four per side maximum. The quick game for people who want one decision and no admin.",
  },
  full: {
    id: "full",
    name: "Captain's Dozen",
    short: "Dozen",
    tagline: "All twelve, like a real captain",
    squadSize: 12,
    budget: 200,
    maxPerSide: 6,
    blurb:
      "A full twelve-player card on 200m credits — six from each side, every session covered, captain doubles match points.",
  },
};

export const MODE_LIST = [MODES.classic, MODES.full];

/* ——— Commercials ——— */

export const PLANS = [
  {
    id: "single",
    name: "Single entry",
    price: 10,
    currency: "EUR",
    entries: 1,
    blurb: "One team, every game mode, all three days of scoring.",
    features: ["Classic Six or Captain's Dozen", "Match predictor included", "Live scoring & league tables"],
    highlight: true,
    prizeEligible: true,
  },
  {
    id: "league-pack",
    name: "League pack",
    price: 60,
    currency: "EUR",
    entries: 8,
    blurb: "Enter a full private league as commissioner — eight entries, one payment.",
    features: ["8 entries (€7.50 each)", "Commissioner tools + join code", "League sponsor slot"],
    highlight: false,
    prizeEligible: true,
  },
  {
    id: "season",
    name: "Season pass",
    price: 24,
    currency: "EUR",
    entries: 1,
    blurb: "This cup plus Hazeltine 2029 and Camiral 2031, locked at today's price.",
    features: ["Adare 2027, 2029, 2031", "Archive editions included", "Priority entry when fields lock"],
    highlight: false,
    prizeEligible: true,
  },
] as const;

export const PRIZE_SPLIT = [
  { label: "1st overall", share: 0.35 },
  { label: "2nd overall", share: 0.15 },
  { label: "3rd overall", share: 0.08 },
  { label: "Top 10%", share: 0.20 },
  { label: "Best single session", share: 0.07 },
  { label: "Match predictor", share: 0.10 },
  { label: "Platform & card fees", share: 0.05 },
];

export const SPONSORS = [
  { name: "Adare Village Distillery", tag: "Official whiskey of the 19th hole", tier: "Presenting" },
  { name: "Shannon Airport", tag: "Twenty minutes from the first tee", tier: "Travel" },
  { name: "Limerick County Board", tag: "Community league partner", tier: "Community" },
];

export const ENTRY_FEE = 10;
