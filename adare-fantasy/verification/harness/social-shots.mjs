/**
 * Captures for social sign-in (v0.7).
 *
 *   BASE=http://127.0.0.1:3100 OUT=../screenshots node social-shots.mjs
 *
 * The base server must be started *with* provider credentials — the buttons are
 * drawn from `/api/auth/providers`, so a server without them renders nothing.
 * Nothing here talks to Google, Apple or Facebook: the captures stop at the
 * sign-in row and at the error banner the callback writes.
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./chrome.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const OUT = process.env.OUT ?? path.join(process.cwd(), "..", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const shots = [];
const browser = await launch({ width: 1440, height: 1100 });

async function shoot(name, url, { width = 1440, height = 1100, scale = 1.5, settle = 900 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(BASE + url, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((resolve) => setTimeout(resolve, settle));
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  const heading = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
  shots.push({ file: name, url, width, height, scale, heading });
  console.log(`captured ${name}  ${url}`);
  await page.close();
}

await shoot("37-social-signin-account.png", "/account");
await shoot("38-social-signin-enter.png", "/enter");
await shoot(
  "39-social-signin-error.png",
  "/account?signin=error&reason=That%20Apple%20account%20is%20already%20attached%20to%20another%20entry.%20Sign%20out%20first%20if%20you%20meant%20to%20switch.",
);
await shoot("40-social-signin-mobile.png", "/account", { width: 390, height: 844, scale: 2 });

fs.writeFileSync(path.join(OUT, "social-capture-log.json"), JSON.stringify({ base: BASE, shots }, null, 2));
await browser.close();
console.log(`\n${shots.length} captures written to ${OUT}`);
