/**
 * Records the live simulation: Sunday singles at 4× starting from ?t=2700,
 * through to the cup being decided. Writes frames for encode.mjs and two
 * screenshots.
 *
 *   node record-live.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { launch, startScreencast } from "./chrome.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = process.env.OUT ?? path.join(process.cwd(), "run");
const SHOTS = path.join(OUT, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch({ width: 1280, height: 800 });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
fs.mkdirSync(SHOTS, { recursive: true });
const stream = await startScreencast(page, path.join(OUT, "frames", "03-live"));

const click = async (re, wait = 400) => {
  const hit = await page.evaluate((source) => {
    const rx = new RegExp(source, "i");
    const el = [...document.querySelectorAll("button, a")].find((e) => rx.test((e.textContent || "").trim()));
    if (!el) return false;
    el.click();
    return true;
  }, re.source);
  if (!hit) console.log(`[live] no control matches ${re}`);
  await sleep(wait);
};

await page.goto(BASE + "/live?t=2700", { waitUntil: "networkidle0" });
await sleep(1200);
await page.screenshot({ path: path.join(SHOTS, "19-live-sunday.png") });
await click(/^4×$/, 300);
await click(/Play/, 900);
await sleep(16_000);
await page.screenshot({ path: path.join(SHOTS, "20-live-final.png") });

const { frames, seconds } = await stream.stop();
await browser.close();
console.log(`[live] ${frames} frames, ${seconds.toFixed(1)}s, page errors: ${errors.length}`);
if (errors.length) process.exitCode = 1;
