/**
 * Assertion pass over the flows the videos demonstrate. Each check is a real
 * assertion (not just a screenshot) and the run fails if any of them break.
 *
 *   node checks.mjs        # writes browser-results.json
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./chrome.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = process.env.OUT ?? path.join(process.cwd(), "run");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function open(width = 1280, height = 800) {
  const browser = await launch({ width, height });
  const page = await browser.newPage();
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
    if (!hit) throw new Error(`nothing clickable matches ${re}`);
    await sleep(wait);
  };
  const fill = async (placeholder, value) => {
    const selector = `input[placeholder="${placeholder}"]`;
    await page.waitForSelector(selector, { timeout: 10_000 });
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(selector, value, { delay: 8 });
  };
  const header = () =>
    page.evaluate(() => [...document.querySelectorAll("header a")].map((a) => a.textContent.trim()).join(" | "));
  return { browser, page, text, click, fill, header };
}

const pay = async (session, email) => {
  await session.page.goto(BASE + "/enter", { waitUntil: "networkidle0" });
  await session.fill("you@example.com", email);
  await session.fill("Séamus Ryan", "Checks Runner");
  await session.fill("Bogey Merchants", "Assertion FC");
  await session.fill("4242 4242 4242 4242", "4242 4242 4242 4242");
  await session.fill("09 / 27", "09 / 27");
  await session.fill("123", "123");
  await session.click(/Pay €10 & enter/, 1600);
};

/* ——— unpaid visitor ——— */
{
  const s = await open();
  await s.page.goto(BASE + "/", { waitUntil: "networkidle0" });
  check("fresh visitor is offered a paid entry, not a card", /Enter · €10/.test(await s.header()), await s.header());

  await s.page.goto(BASE + "/enter", { waitUntil: "networkidle0" });
  const plans = await s.text();
  check("entry page lists three paid plans and no free tier",
    /Single entry/.test(plans) && /League pack/.test(plans) && /Season pass/.test(plans) && !/Free play|Join free/.test(plans));
  check("checkout does not pre-fill the demo identity",
    (await s.page.evaluate(() => document.querySelector('input[placeholder="Séamus Ryan"]')?.value)) === "");

  await s.page.goto(BASE + "/draft", { waitUntil: "networkidle0" });
  await sleep(600);
  check("unpaid card cannot be saved", /Enter €10 to save/i.test(await s.text()));

  await s.browser.close();
}

/* ——— paying customer ——— */
const email = `checks+${Date.now()}@example.com`;
{
  const s = await open();
  await pay(s, email);
  const receipt = await s.text();
  check("payment issues a receipt", /TE-[A-Z0-9]{6}-ADRE/.test(receipt), (receipt.match(/TE-[A-Z0-9]{6}-ADRE/) ?? ["none"])[0]);
  check("header shows My card after paying", /My card/.test(await s.header()), await s.header());

  await s.page.goto(BASE + "/draft", { waitUntil: "networkidle0" });
  await sleep(600);
  check("paid state survives a reload", /My card/.test(await s.header()), await s.header());
  await s.click(/Captain's Dozen/, 500);
  await s.click(/Auto-pick/, 800);
  await s.click(/Save my card/, 1400);
  check("twelve-player card saves", /Card saved/i.test(await s.text()));

  await s.page.goto(BASE + "/predict", { waitUntil: "networkidle0" });
  await sleep(600);
  await s.click(/Favourites auto-pick/, 800);
  const picks = await s.text();
  check("predictor fills all 28 matches", /28\/28/.test(picks), (picks.match(/\d+\/28/) ?? ["none"])[0]);
  await s.click(/Save my picks/, 1200);
  check("picks save to the server", /Picks saved/i.test(await s.text()));

  await s.page.goto(BASE + "/account", { waitUntil: "networkidle0" });
  await sleep(600);
  const account = await s.text();
  check("account shows the saved twelve-player card", /12 players/i.test(account) && /Assertion FC/i.test(account));

  await s.page.goto(BASE + "/leagues", { waitUntil: "networkidle0" });
  await sleep(600);
  await s.click(/Create (a )?league|New league|Start a league/, 500);
  const inputs = await s.page.$$("input");
  if (inputs[0]) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type("Assertion League", { delay: 10 });
  }
  await s.click(/Create|Start|Save/, 1500);
  check("private league is created with a join code", /created/i.test(await s.text()) && /\b[A-Z]{3}[A-Z0-9]{3}\b/.test(await s.text()));

  await s.browser.close();
}

/* ——— mobile ——— */
{
  const s = await open(390, 844);
  await s.page.goto(BASE + "/", { waitUntil: "networkidle0" });
  check("mobile home offers the paid entry CTA", /Enter · €10/.test(await s.header()), await s.header());
  await pay(s, `mobile+${Date.now()}@example.com`);
  check("mobile checkout completes", /TE-[A-Z0-9]{6}-ADRE/.test(await s.text()));
  await s.browser.close();
}

/* ——— takeover ——— */
{
  const s = await open();
  await pay(s, email);
  check("second browser cannot take over the account", /already has an entry/i.test(await s.text()));
  await s.browser.close();
}

const passed = results.filter((r) => r.pass).length;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "browser-results.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} browser checks pass`);
if (passed !== results.length) process.exitCode = 1;
