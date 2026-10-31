/**
 * Records the end-to-end journey and captures a screenshot at every step.
 *
 *   node record.mjs                       # both stages, against http://127.0.0.1:3000
 *   BASE=http://localhost:3001 OUT=./run node record.mjs
 *
 * Outputs:
 *   $OUT/frames/01-desktop/*.jpg + timing.json   (input for encode.mjs)
 *   $OUT/frames/02-mobile/*.jpg  + timing.json
 *   $OUT/shots/01-home.png … 20-mobile-account.png
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
    const file = path.join(SHOTS, `${label}.png`);
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
  await snap("01-home");

  await page.goto(BASE + "/enter", { waitUntil: "networkidle0" });
  await sleep(600);
  await snap("02-checkout-empty");
  await fill("you@example.com", email);
  await fill("Séamus Ryan", "Aoife Byrne");
  await fill("Bogey Merchants", "Adare Aces");
  await fill("4242 4242 4242 4242", "4242 4242 4242 4242");
  await fill("09 / 27", "09 / 27");
  await fill("123", "123");
  await snap("03-checkout-filled");
  await click(/Pay €10 & enter/, 1600);
  await snap("04-receipt");
  if (!/TE-[A-Z0-9]{6}-ADRE/.test(await text())) throw new Error("no receipt after paying");

  await page.goto(BASE + "/draft", { waitUntil: "networkidle0" });
  await sleep(500);
  await click(/Captain's Dozen/, 700);
  await snap("05-draft-empty");
  await click(/Auto-pick/, 900);
  await snap("06-draft-filled");
  await click(/Save my card/, 1400);
  await snap("07-card-saved");

  await page.goto(BASE + "/predict", { waitUntil: "networkidle0" });
  await sleep(700);
  await snap("08-predictor-empty");
  await click(/Favourites auto-pick/, 900);
  await snap("09-predictor-filled");
  await click(/Save my picks/, 1300);
  await snap("10-picks-saved");

  await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
  await sleep(700);
  await snap("11-account");

  await page.goto(BASE + "/leagues", { waitUntil: "networkidle0" });
  await sleep(700);
  await snap("12-leagues");
  await click(/Create (a )?league|New league|Start a league/, 700);
  await sleep(400);
  const inputs = await page.$$("input");
  if (inputs[0]) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type("Sunday Singles", { delay: 15 });
  }
  await snap("13-league-form");
  await click(/Create|Start|Save/, 1400);
  await snap("14-league-created");

  await page.goto(BASE + "/live", { waitUntil: "networkidle0" });
  await sleep(1500);
  await snap("15-live");
});

await stage("02-mobile", 390, 844, async ({ page, snap, click, fill }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(900);
  await snap("16-mobile-home");

  const mobileEmail = `mobile+${Date.now()}@example.com`;
  fs.writeFileSync(path.join(OUT, "mobile-email.txt"), mobileEmail);
  await page.goto(BASE + "/enter", { waitUntil: "networkidle0" });
  await sleep(500);
  await fill("you@example.com", mobileEmail);
  await fill("Séamus Ryan", "Cian Doyle");
  await fill("Bogey Merchants", "Kerry Bogtrotters");
  await fill("4242 4242 4242 4242", "4242 4242 4242 4242");
  await fill("09 / 27", "09 / 27");
  await fill("123", "123");
  await snap("17-mobile-checkout");
  await click(/Pay €10 & enter/, 1600);
  await snap("18-mobile-receipt");

  await page.goto(BASE + "/draft", { waitUntil: "networkidle0" });
  await sleep(500);
  await click(/Auto-pick/, 900);
  await snap("19-mobile-draft");
  await click(/Save my card/, 1300);

  await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
  await sleep(600);
  await snap("20-mobile-account");
});

fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(log, null, 2));
console.log(`\n${log.length} screenshots → ${SHOTS}`);
