/**
 * Records the end-to-end journey and captures a screenshot at every step.
 *
 *   node record.mjs                       # both stages, against http://127.0.0.1:3000
 *   BASE=http://localhost:3001 OUT=./run node record.mjs
 *
 * Outputs:
 *   $OUT/frames/01-desktop/*.jpg + timing.json   (input for encode.mjs)
 *   $OUT/frames/02-mobile/*.jpg  + timing.json
 *   $OUT/shots/01-home.png … (+ the takeover shot from takeover.mjs)
 *   $OUT/shots.json, $OUT/email.txt
 *
 * Run it against a production build with a clean store: the flow creates a real
 * account and pays for a real entry.
 */
import fs from "node:fs";
import path from "node:path";
import { launch, startScreencast } from "./chrome.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = process.env.OUT ?? path.join(process.cwd(), "run");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
/** Screenshots are numbered in the order they are taken, across both stages. */
let shotIndex = 0;

async function stage(name, width, height, flow) {
  const browser = await launch({ width, height });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  const stream = await startScreencast(page, path.join(OUT, "frames", name));

  const snap = async (label) => {
    shotIndex += 1;
    const file = path.join(SHOTS, `${String(shotIndex).padStart(2, "0")}-${label}.png`);
    await page.screenshot({ path: file });
    log.push({ stage: name, shot: path.basename(file), url: page.url() });
    return file;
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const click = async (re, wait = 900) => {
    const hit = await page.evaluate((source) => {
      const rx = new RegExp(source, "i");
      const el = [...document.querySelectorAll("button, a, [role=button]")].find(
        (e) => rx.test((e.textContent || "").trim()) && !e.disabled,
      );
      if (!el) return false;
      el.click();
      return true;
    }, re.source);
    if (!hit) throw new Error(`nothing clickable matches ${re} on ${page.url()}`);
    await sleep(wait);
  };
  const fill = async (placeholder, value) => {
    const selector = `input[placeholder="${placeholder}"]`;
    await page.waitForSelector(selector, { timeout: 10_000 });
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(selector, value, { delay: 12 });
  };

  try {
    await flow({ page, snap, click, fill, text, sleep });
  } finally {
    const { frames, seconds } = await stream.stop();
    await browser.close();
    console.log(`[${name}] ${frames} frames, ${seconds.toFixed(1)}s, console errors: ${errors.length ? JSON.stringify(errors.slice(0, 3)) : "none"}`);
    if (errors.length) process.exitCode = 1;
  }
}

const email = `e2e+${Date.now()}@example.com`;
fs.writeFileSync(path.join(OUT, "email.txt"), email);

await stage("01-desktop", 1280, 800, async ({ page, snap, click, fill, text }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(1200);
  await snap("home");

  await page.goto(BASE + "/enter", { waitUntil: "networkidle0" });
  await sleep(600);
  await snap("checkout-empty");
  await fill("you@example.com", email);
  await fill("Séamus Ryan", "Aoife Byrne");
  await fill("Bogey Merchants", "Adare Aces");
  await snap("checkout-filled");
  await click(/Continue to payment/, 1800);
  await page.waitForFunction(() => /\/pay\/ORD-/.test(location.pathname), { timeout: 10_000 });
  await sleep(700);
  await snap("payment");
  await click(/Pay €10 · demo card/, 1800);
  await snap("receipt");
  if (!/TE-[A-Z0-9]{6}-ADRE/.test(await text())) throw new Error("no receipt after paying");

  await page.goto(BASE + "/draft", { waitUntil: "networkidle0" });
  await sleep(500);
  await click(/Captain's Dozen/, 700);
  await snap("draft-empty");
  await click(/Auto-pick/, 900);
  await snap("draft-filled");
  await click(/Save my card/, 1400);
  await snap("card-saved");

  await page.goto(BASE + "/predict", { waitUntil: "networkidle0" });
  await sleep(700);
  await snap("predictor-empty");
  await click(/Favourites auto-pick/, 900);
  await snap("predictor-filled");
  await click(/Save my picks/, 1300);
  await snap("picks-saved");

  await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
  await sleep(700);
  await snap("account");

  await page.goto(BASE + "/leaderboard", { waitUntil: "networkidle0" });
  await sleep(1400);
  await snap("leaderboard");

  await page.goto(BASE + "/pinpoint", { waitUntil: "networkidle0" });
  await sleep(700);
  await snap("pinpoint-empty");
  const guesses = await page.$$("input[inputmode=decimal], input[inputmode=numeric]");
  if (guesses[0]) { await guesses[0].click({ clickCount: 3 }); await guesses[0].type("4.5", { delay: 15 }); }
  if (guesses[1]) { await guesses[1].click({ clickCount: 3 }); await guesses[1].type("352", { delay: 15 }); }
  await snap("pinpoint-guess");
  await click(/Save my guesses/, 1300);
  await snap("pinpoint-saved");

  await page.goto(BASE + "/leagues", { waitUntil: "networkidle0" });
  await sleep(700);
  await snap("leagues");
  await click(/Create (a )?league|New league|Start a league/, 700);
  await sleep(400);
  const inputs = await page.$$("input");
  if (inputs[0]) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type("Sunday Singles", { delay: 15 });
  }
  await snap("league-form");
  await click(/Create|Start|Save/, 1400);
  await snap("league-created");

  await page.goto(BASE + "/live", { waitUntil: "networkidle0" });
  await sleep(1500);
  await snap("live");

});

await stage("02-mobile", 390, 844, async ({ page, snap, click, fill }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(900);
  await snap("mobile-home");

  const mobileEmail = `mobile+${Date.now()}@example.com`;
  fs.writeFileSync(path.join(OUT, "mobile-email.txt"), mobileEmail);
  await page.goto(BASE + "/enter", { waitUntil: "networkidle0" });
  await sleep(500);
  await fill("you@example.com", mobileEmail);
  await fill("Séamus Ryan", "Cian Doyle");
  await fill("Bogey Merchants", "Kerry Bogtrotters");
  await snap("mobile-checkout");
  await click(/Continue to payment/, 1800);
  await page.waitForFunction(() => /\/pay\/ORD-/.test(location.pathname), { timeout: 10_000 });
  await sleep(600);
  await snap("mobile-payment");
  await click(/Pay €10 · demo card/, 1800);
  await snap("mobile-receipt");

  await page.goto(BASE + "/draft", { waitUntil: "networkidle0" });
  await sleep(500);
  await click(/Auto-pick/, 900);
  await snap("mobile-draft");
  await click(/Save my card/, 1300);

  await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
  await sleep(600);
  await snap("mobile-account");
});

await stage("03-admin", 1280, 900, async ({ page, snap, click }) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return;
  await page.goto(BASE + "/admin", { waitUntil: "networkidle0" });
  await sleep(500);
  await page.evaluate((value) => {
    const input = document.querySelector('input[type="password"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, adminToken);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Connect$/i.test(b.textContent.trim()))?.click());
  await sleep(1800);
  await snap("admin-payments");

  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /prizes/i.test(b.textContent))?.click());
  await sleep(800);
  await snap("admin-prizes-empty");

  // The mobile entrant plays alone, so their fee is the global pot.
  await click(/Settle the global pot/, 1600);
  await snap("admin-prizes");

  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /results/i.test(b.textContent))?.click());
  await sleep(800);
  await snap("admin-results");
});

fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(log, null, 2));
console.log(`\n${log.length} screenshots → ${SHOTS}`);
