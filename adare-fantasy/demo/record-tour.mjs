/**
 * Records the whole product, once, in one sitting — the source of
 * `twenty-eight-start-to-finish.webm`.
 *
 *   node demo/record-tour.mjs         # needs the app running on :3000
 *
 * Puppeteer drives the real app against a clean store: an entry is bought, a
 * card and 28 predictions are saved, a league is created, the cup is watched to
 * a decided result, and an operator settles the prize pot. Frames come from the
 * DevTools screencast; each step's caption is written to `cues.json` with the
 * moment it appeared, so `render-tour.mjs` can burn the captions back in at the
 * exact times they were true.
 *
 * A gold ring is drawn around the control that is about to be used, because the
 * screencast does not capture a mouse pointer.
 */
import fs from "node:fs";
import path from "node:path";
import { launch, startScreencast } from "../verification/harness/chrome.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.env.OUT ?? path.join(ROOT, "run");
const FRAMES = path.join(OUT, "frames");
const STILLS = path.join(OUT, "stills");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(STILLS, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const email = `tour+${Date.now()}@example.com`;

const browser = await launch({ width: 1440, height: 900 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

// The hover/click ring, injected once per page.
const RING = `(() => {
  if (document.getElementById("tour-ring")) return;
  const style = document.createElement("style");
  style.id = "tour-ring";
  style.textContent = \`
    .tour-ring { outline: 3px solid #d8b25a !important; outline-offset: 4px !important;
      border-radius: 8px; transition: outline-color 120ms ease; }
  \`;
  document.head.appendChild(style);
})();`;

// Screencast first: the first painted frame should be the landing page, not a blank tab.
const recorder = await startScreencast(page, FRAMES);

const started = Date.now();
const cues = [];
let open = null;

function say(text) {
  const at = (Date.now() - started) / 1000;
  if (open) open.end = Number(at.toFixed(2));
  open = { start: Number(at.toFixed(2)), end: null, text };
  cues.push(open);
}

const shot = async (name) => page.screenshot({ path: path.join(STILLS, `${name}.png`) });

/** Find a control by its visible text, ring it, then click it. */
async function click(re, { wait = 900, ring = 320 } = {}) {
  const found = await page.evaluate(
    (source) => {
      const rx = new RegExp(source, "i");
      const el = [...document.querySelectorAll("button, a, [role=tab], [role=button]")].find(
        (candidate) => rx.test((candidate.textContent || "").trim()) && !candidate.disabled,
      );
      if (!el) return false;
      el.classList.add("tour-ring");
      el.scrollIntoView({ block: "center" });
      return true;
    },
    re.source,
  );
  if (!found) throw new Error(`nothing clickable matches ${re} on ${page.url()}`);
  await sleep(ring);
  await page.evaluate((source) => {
    const rx = new RegExp(source, "i");
    const el = [...document.querySelectorAll("button, a, [role=tab], [role=button]")].find(
      (candidate) => rx.test((candidate.textContent || "").trim()),
    );
    el?.click();
  }, re.source);
  await sleep(120);
  await page.evaluate(() => document.querySelectorAll(".tour-ring").forEach((el) => el.classList.remove("tour-ring")));
  await sleep(wait);
}

async function fill(placeholder, value) {
  const selector = `input[placeholder="${placeholder}"]`;
  await page.waitForSelector(selector, { timeout: 10_000 });
  const handle = await page.$(selector);
  await page.evaluate((el) => el.classList.add("tour-ring"), handle);
  await sleep(200);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay: 26 });
  await sleep(140);
  await page.evaluate(() => document.querySelectorAll(".tour-ring").forEach((el) => el.classList.remove("tour-ring")));
}

async function goto(route, { settle = 1400 } = {}) {
  await page.goto(BASE + route, { waitUntil: "networkidle0" });
  await page.evaluate(RING);
  await sleep(settle);
}

/* ——— 1. Landing ——— */
await goto("/", { settle: 1600 });
say("Twenty-Eight: fantasy for the Ryder Cup. Adare 2027 is the first edition — 2029 and 2031 are already in the platform.");
await sleep(5200);
await shot("01-home");

/* ——— 2. Entry ——— */
await goto("/enter");
say("Entry is paid: €10 for one card, €60 for a league of eight, €24 for three editions. No free tier.");
await sleep(3600);
await fill("you@example.com", email);
await fill("Séamus Ryan", "Aoife Byrne");
await fill("Bogey Merchants", "Adare Aces");
say("Two fields matter at checkout: the email that owns the entry, and the team name on the table.");
await sleep(2600);
await shot("02-entry");
await click(/Continue to payment/);
await page.waitForFunction(() => /\/pay\/ORD-/.test(location.pathname), { timeout: 10_000 });
await sleep(1200);

/* ——— 3. Payment ——— */
say("Checkout opens a pending order and nothing else. No entry exists yet — the app hands back a payment URL.");
await sleep(3600);
await shot("03-payment");
await click(/Pay €10 · demo card/, { wait: 1500 });
say("Paying settles the order. This is the same settlement a Stripe webhook triggers, with the card replaced by a button.");
await sleep(3400);
await shot("04-paid");

/* ——— 4. Draft ——— */
await goto("/draft");
say("Draft: twelve players from a €200m budget, or six from €100m, whichever mode you pick.");
await sleep(3200);
await click(/Captain's Dozen/);
await click(/Auto-pick/, { wait: 1200 });
say("Auto-pick fills a legal card — a captain, a budget that balances, a limit from each side.");
await sleep(3000);
await shot("05-draft");
await click(/Save my card/, { wait: 1600 });
say("The card is validated and stored on the server, not in the browser. Captain's match points count double.");
await sleep(3000);

/* ——— 5. Predictor ——— */
await goto("/predict");
say("The match predictor needs all 28 matches — eight foursomes, eight fourball, twelve singles — plus three awards.");
await sleep(3400);
await click(/Favourites auto-pick/, { wait: 1200 });
say("Two points per correct match, five per award, ten for the exact scoreline — but only once the cup is decided.");
await sleep(3000);
await shot("06-predict");
await click(/Save my picks/, { wait: 1400 });
say("Picks lock with the card at the first tee. Until then they can be edited as often as you like.");
await sleep(2600);

/* ——— 6. Pinpoint ——— */
await goto("/pinpoint");
say("Pinpoint is the side game: nearest-the-pin in feet and longest drive in yards, for each day.");
await sleep(2600);
const guesses = await page.$$("input[inputmode=decimal], input[inputmode=numeric]");
if (guesses[0]) {
  await guesses[0].click({ clickCount: 3 });
  await guesses[0].type("4.5", { delay: 40 });
}
if (guesses[1]) {
  await guesses[1].click({ clickCount: 3 });
  await guesses[1].type("352", { delay: 40 });
}
await sleep(1400);
await shot("07-pinpoint");
await click(/Save my guesses/, { wait: 1400 });
say("Ten points for a perfect guess, minus one per foot and one per three yards.");
await sleep(2400);

/* ——— 7. Account ——— */
await goto("/account");
say("The account page shows the receipt and the working: card points plus prediction points, player by player.");
await sleep(4200);
await shot("08-account");

/* ——— 8. Table ——— */
await goto("/leaderboard");
say("The table is scored on the server from one results snapshot, so a browser cannot invent a score.");
await sleep(4200);
await shot("09-table");

/* ——— 9. Leagues ——— */
await goto("/leagues");
say("Private leagues live on the server too: create one, share the code, and friends join from their own phones.");
await sleep(2800);
await click(/Create (a )?league|New league|Start a league/);
const inputs = await page.$$("input");
if (inputs[0]) {
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type("Sunday Singles", { delay: 30 });
}
await shot("10-league-form");
await click(/Create|Start|Save/, { wait: 1700 });
say("The league gets a join code and its own table, with the same scoring as the global one.");
await sleep(3200);
await shot("11-league");

/* ——— 10. Live ——— */
await goto("/live?t=2700", { settle: 1600 });
say("Live: the cup runs from the first tee on Friday to the last putt on Sunday. Here it is already Sunday singles.");
await sleep(3200);
await click(/^4×$/, { wait: 500 });
await click(/Play/, { wait: 900 });
say("At 4× the singles finish in seconds; the cup, the table and the fantasy points all move together.");
await sleep(15_000);
await shot("12-live-final");

/* ——— 11. Operator console ——— */
await goto("/admin");
say("And the back office: one page, behind the admin token, for the people running the competition.");
await sleep(2600);
const token = process.env.ADMIN_TOKEN;
if (token) {
  await page.evaluate((value) => {
    const input = document.querySelector('input[type="password"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, token);
  await click(/^Connect$/, { wait: 1800 });
  say("Every order, what was taken, the 5% that covers fees, the 95% that funds the prize pool, and what has been paid out.");
  await sleep(4200);
  await shot("13-admin-payments");

  await click(/^Prizes$/, { wait: 900 });
  say("Prizes settle per pot — the global table, or a private league. This entry plays in a league, so its fee funds that league's pot.");
  await sleep(2600);
  await page.evaluate(() => {
    const select = document.querySelector("select");
    const option = select ? [...select.options].find((row) => /Sunday Singles/i.test(row.textContent || "")) : null;
    if (select && option) {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.classList.add("tour-ring");
    }
  });
  await sleep(1400);
  await page.evaluate(() => document.querySelectorAll(".tour-ring").forEach((el) => el.classList.remove("tour-ring")));
  say("Every line that cannot be awarded is named instead of quietly kept — here there is one entrant, so second and third are reported.");
  await sleep(2600);
  await click(/Settle this pot/, { wait: 1600 });
  say("A settled pot can be paid, and then cannot be settled again — the ledger is the record, not a spreadsheet.");
  await sleep(3600);
  await shot("14-admin-prizes");

  await click(/^Results$/, { wait: 900 });
  say("Operators can correct a match, an event or an award; the table re-scores immediately from the same engine.");
  await sleep(3200);
  await shot("15-admin-results");
}

/* ——— 12. Close ——— */
await goto("/", { settle: 1500 });
say("One brand, one scoring engine, a new edition every two years: Adare 2027, then Hazeltine 2029 and Camiral 2031.");
await sleep(4600);

const { frames, seconds } = await recorder.stop();
await browser.close();

const last = cues[cues.length - 1];
if (last) last.end = Number(seconds.toFixed(2));
fs.writeFileSync(path.join(OUT, "cues.json"), JSON.stringify(cues, null, 2));
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ seconds, frames, errors, stills: STILLS }, null, 2));
console.log(`[tour] ${frames} frames, ${seconds.toFixed(1)}s, ${cues.length} captions, console errors: ${errors.length ? errors.length : "none"}`);
if (errors.length) console.log(errors.slice(0, 3).join("\n"));
