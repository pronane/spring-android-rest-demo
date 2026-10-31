/**
 * Proves the account-takeover guard visually: a fresh browser tries to pay with
 * the email that record.mjs already used, and the server answers 409.
 *
 *   node takeover.mjs        # after record.mjs, which writes $OUT/email.txt
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./chrome.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = process.env.OUT ?? path.join(process.cwd(), "run");
const SHOTS = path.join(OUT, "shots");
const email = fs.readFileSync(path.join(OUT, "email.txt"), "utf8").trim();
/** Screenshots are numbered continuously across the recording scripts. */
function nextShot(refresh = true) {
  const used = (fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS) : [])
    .map((name) => Number((name.match(/^(\d+)-/) ?? [])[1]))
    .filter((n) => Number.isFinite(n));
  return String((used.length ? Math.max(...used) : 0) + (refresh ? 1 : 0)).padStart(2, "0");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch({ width: 1280, height: 800 });
const page = await browser.newPage();
await page.goto(BASE + "/enter", { waitUntil: "networkidle0" });

const fill = async (placeholder, value) => {
  const selector = `input[placeholder="${placeholder}"]`;
  await page.waitForSelector(selector, { timeout: 10_000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay: 10 });
};

await fill("you@example.com", email);
await fill("Séamus Ryan", "Imposter");
await fill("Bogey Merchants", "Not My Team");
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Continue to payment/.test(b.textContent))?.click());
await sleep(1500);

const text = await page.evaluate(() => document.body.innerText);
await page.screenshot({ path: path.join(SHOTS, `${nextShot()}-takeover-blocked.png`) });
await browser.close();

const blocked = /already has an entry/i.test(text);
console.log(blocked ? "PASS  takeover blocked with a 409 message" : "FAIL  no takeover message");
if (!blocked) process.exitCode = 1;
