#!/usr/bin/env node
/**
 * The end-to-end test: a browser, a real entry, and every page a player touches.
 *
 *   npm run e2e              # headless, starts its own server on a clean store
 *   npm run e2e -- --headed  # same, with a window you can watch
 *   BASE=http://localhost:3000 npm run e2e    # against a server already running
 *
 * It buys an entry with the demo card, drafts a six by hand (clicking six
 * players, naming a captain), calls all 28 matches session by session, reads
 * its own points, checks the fantasy table and the public share card, makes a
 * free transfer, signs out and signs back in with a one-time email link — and
 * checks that the social sign-in row matches what the deployment actually
 * offers (buttons where providers are configured, nothing where they are not).
 *
 * Exit code is 0 only if every step passed. `--shots` also writes a screenshot
 * per step to `.data/e2e-shots/`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { launchBrowser } from "./browser.mjs";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const HEADED = args.has("--headed") || process.env.HEADED === "1";
const SHOTS = args.has("--shots") || process.env.SHOTS === "1";
const SHOT_DIR = path.resolve(ROOT, process.env.SHOT_DIR ?? ".data/e2e-shots");

const SQUAD = ["Rory McIlroy", "Ludvig Åberg", "Shane Lowry", "Scottie Scheffler", "Collin Morikawa", "Sepp Straka"];
const SESSIONS = ["Fri 17 Sep · Foursomes", "Fri 17 Sep · Fourball", "Sat 18 Sep · Foursomes", "Sat 18 Sep · Fourball", "Sun 19 Sep · Singles"];
const EMAIL = `e2e+${Date.now()}@example.com`;
// Where the server writes the emails it would send. When this script starts the
// server it sets this itself; against an external server it reads the same key
// from the environment (the installer's .env.local points at .data/outbox).
const OUTBOX = path.resolve(ROOT, process.env.MAIL_OUTBOX ?? ".data/e2e-outbox");
const TEAM = "Browser FC";
const MANAGER = "E2E Runner";

let passed = 0;
const failures = [];
let stepNo = 0;
const total = 15;

const log = (message) => console.log(message);

async function step(name, fn) {
  stepNo += 1;
  const label = `${String(stepNo).padStart(2, "0")}/${total} ${name}`;
  const started = Date.now();
  try {
    const detail = await fn();
    passed += 1;
    log(`PASS  ${label}${detail ? `  — ${detail}` : ""}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    if (SHOTS) await currentPage?.screenshot({ path: path.join(SHOT_DIR, `${String(stepNo).padStart(2, "0")}.png`), fullPage: true });
  } catch (error) {
    failures.push({ step: label, error: error instanceof Error ? error.message : String(error) });
    log(`FAIL  ${label}\n      ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/* ——— the server under test ——— */

let currentPage = null;
let server = null;
let browserHandle = null;

async function freePort(start = 3311) {
  for (let port = start; port < start + 40; port += 1) {
    const taken = await new Promise((resolve) => {
      const net = require("node:net");
      const probe = net.createServer();
      probe.once("error", () => resolve(true));
      probe.once("listening", () => probe.close(() => resolve(false)));
      probe.listen(port, "127.0.0.1");
    });
    if (!taken) return port;
  }
  throw new Error("No free port found for the test server.");
}

/** Empties the store so the run starts from zero — whichever backend is in use. */
async function resetStore() {
  if (process.env.DATABASE_URL) {
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(
      "begin; delete from login_tokens; delete from prizes; delete from ledger; delete from orders; delete from leagues; delete from webhook_events; delete from results; delete from users; commit;",
    );
    await client.end();
    return "postgres";
  }
  const file = path.join(ROOT, process.env.DB_FILE ?? ".data/twentyeight-e2e.json");
  fs.rmSync(file, { force: true });
  return `json (${path.relative(ROOT, file)})`;
}

async function ensureServer() {
  if (process.env.BASE) return { base: process.env.BASE.replace(/\/$/, ""), external: true };

  const store = await resetStore();
  fs.rmSync(OUTBOX, { recursive: true, force: true });
  log(`store: ${store}`);
  const port = await freePort();
  const next = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-secret-0123456789abcdef",
      PAYMENTS_PROVIDER: "demo",
      // A local inbox: the sign-in link is a real email, written to disk.
      MAIL_OUTBOX: OUTBOX,
      APP_URL: `http://127.0.0.1:${port}`,
      ...(process.env.DATABASE_URL ? {} : { DB_FILE: process.env.DB_FILE ?? ".data/twentyeight-e2e.json" }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  server.stdout.on("data", (chunk) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk) => output.push(chunk.toString()));
  server.on("exit", (code) => {
    if (code !== 0 && code !== null) log(`\nserver exited with ${code}:\n${output.join("")}`);
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/session`);
      if (res.ok) return { base, external: false };
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`The server did not start within 90s.\n${output.join("")}`);
}

/* ——— browser helpers ——— */

const SET_INPUT = (selector, value) => {
  const element = document.querySelector(selector);
  if (!element) return false;
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

async function fill(page, selector, value) {
  const done = await page.evaluate(SET_INPUT, selector, value);
  if (!done) throw new Error(`No field matching ${selector}`);
}

/** Clicks the first visible button/link whose text matches. */
async function clickText(page, text, { selector = "button, a", exact = false } = {}) {
  const clicked = await page.evaluate(
    (text, selector, exact) => {
      const nodes = [...document.querySelectorAll(selector)];
      const match = nodes.find((node) => {
        const label = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        const hit = exact ? label === text : label.includes(text);
        if (!hit) return false;
        const style = window.getComputedStyle(node);
        return !node.disabled && style.visibility !== "hidden" && style.display !== "none" && node.offsetParent !== null;
      });
      if (!match) return false;
      match.scrollIntoView({ block: "center" });
      match.click();
      return true;
    },
    text,
    selector,
    exact,
  );
  if (!clicked) throw new Error(`Nothing clickable matching "${text}"`);
}

/** Polls the mail outbox for the newest message and pulls the link out of it. */
async function readSignInLink(timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fs.existsSync(OUTBOX)) {
      const files = fs.readdirSync(OUTBOX).filter((file) => file.endsWith(".json")).sort();
      for (const file of files.reverse()) {
        const message = JSON.parse(fs.readFileSync(path.join(OUTBOX, file), "utf8"));
        const link = String(message.text ?? "").match(/https?:\/\/\S+verify\?token=\S+/)?.[0];
        if (link) return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

async function waitText(page, text, timeout = 20_000) {
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    { timeout, polling: 150 },
    text,
  );
}

const bodyText = (page) => page.evaluate(() => document.body.innerText);

/* ——— the run ——— */

async function main() {
  if (SHOTS) fs.rmSync(SHOT_DIR, { recursive: true, force: true });
  const { base } = await ensureServer();
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  log(`\nTwenty-Eight end-to-end — ${base}${HEADED ? " (headed)" : " (headless)"}\n`);

  const browser = await launchBrowser({ headed: HEADED });
  browserHandle = browser;
  const page = await browser.newPage();
  currentPage = page;
  page.setDefaultTimeout(25_000);
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  let entryRef = "";

  await step("the site is up and the home page renders", async () => {
    await page.goto(`${base}/`, { waitUntil: "networkidle0" });
    const text = await bodyText(page);
    assert.ok(text.includes("Twenty-Eight"), "the brand is missing from the home page");
    assert.ok(text.includes("Adare"), "the edition is missing from the home page");
    return `${(await page.title()).slice(0, 48)}…`;
  });

  await step("a visitor opens the entry page", async () => {
    await clickText(page, "Enter", { selector: 'a[href^="/enter"]' });
    await page.waitForSelector('input[type="email"]');
    assert.match(page.url(), /\/enter/);
  });

  await step("they fill in their details", async () => {
    await fill(page, 'input[type="email"]', EMAIL);
    await fill(page, 'input[autocomplete="name"]', MANAGER);
    await fill(page, 'input[autocomplete="organization"]', TEAM);
    const values = await page.evaluate(() => [...document.querySelectorAll("input")].map((input) => input.value));
    assert.ok(values.includes(EMAIL) && values.includes(TEAM), `fields did not take: ${values.join(" | ")}`);
    return EMAIL;
  });

  await step("checkout creates an order and the payment page opens", async () => {
    await clickText(page, "Continue to payment");
    await page.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 20_000 });
    await waitText(page, "One payment");
    const text = await bodyText(page);
    assert.ok(text.includes("€10"), "the price is not on the payment page");
    return page.url().replace(base, "");
  });

  await step("paying settles the order and issues an entry", async () => {
    // The button only exists once the order has loaded from /api/orders/<ref>.
    await waitText(page, "demo card");
    await clickText(page, "demo card");
    await waitText(page, "You are in", 25_000);
    const text = await bodyText(page);
    const ref = text.match(/TE-[A-Z0-9]{6}-ADRE/)?.[0];
    assert.ok(ref, `no entry reference on the page: ${text.slice(0, 300)}`);
    entryRef = ref;
    return ref;
  });

  await step("they draft a six by hand and name a captain", async () => {
    await page.goto(`${base}/draft`, { waitUntil: "networkidle0" });
    // The demo card ships pre-loaded so every screen has content; a real player
    // starts from an empty squad, so empty it the way they would.
    await clickText(page, "Clear");
    await waitText(page, "0/6 picked");
    for (const name of SQUAD) {
      const picked = await page.evaluate((name) => {
        const card = [...document.querySelectorAll("article")].find(
          (node) => node.querySelector("h3")?.textContent?.trim() === name,
        );
        const button = card?.querySelector("button:not([disabled])");
        if (!button) return false;
        button.scrollIntoView({ block: "center" });
        button.click();
        return true;
      }, name);
      if (!picked) throw new Error(`Could not pick ${name} — is it already in the squad?`);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await waitText(page, "6/6");
    const captain = await page.evaluate(() => {
      const button = document.querySelector('button[title="Make captain — points doubled"]');
      if (!button) return false;
      button.click();
      return true;
    });
    assert.ok(captain, "there is no captain control on the card");
    await clickText(page, "Save my card");
    await waitText(page, "Card saved", 20_000);
    return `${SQUAD.length} players + captain`;
  });

  await step("they call all 28 matches, session by session", async () => {
    await page.goto(`${base}/predict`, { waitUntil: "networkidle0" });
    let calls = 0;
    for (const session of SESSIONS) {
      await clickText(page, session);
      await new Promise((resolve) => setTimeout(resolve, 150));
      calls += await page.evaluate(() => {
        const groups = [...document.querySelectorAll('[role="group"][aria-label^="Match "]')];
        let clicked = 0;
        for (const group of groups) {
          const option = group.querySelector("button");
          if (option) {
            option.click();
            clicked += 1;
          }
        }
        return clicked;
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    assert.equal(calls, 28, `expected 28 matches, clicked ${calls}`);
    await page.evaluate(() => {
      for (const select of document.querySelectorAll("select")) {
        const option = [...select.options].find((candidate) => candidate.value);
        if (option) {
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, option.value);
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });
    await clickText(page, "Save my picks");
    await waitText(page, "Picks saved", 20_000);
    return `${calls} matches + 3 awards`;
  });

  await step("their card is on the team page with a points projection", async () => {
    await page.goto(`${base}/team`, { waitUntil: "networkidle0" });
    const text = await bodyText(page);
    for (const short of ["McIlroy", "Åberg", "Lowry"]) {
      assert.ok(text.includes(short), `${short} is missing from the card`);
    }
    assert.ok(/\d/.test(text), "no numbers on the card");
    return "six players";
  });

  await step("the account page shows the entry, the invitation and the breakdown", async () => {
    await page.goto(`${base}/account`, { waitUntil: "networkidle0" });
    await waitText(page, entryRef);
    const text = await bodyText(page);
    assert.ok(text.includes(EMAIL), "the account email is missing");
    assert.ok(/points|pts/i.test(text), "no points on the account page");
    return entryRef;
  });

  await step("the fantasy table includes their entry", async () => {
    await page.goto(`${base}/leaderboard`, { waitUntil: "networkidle0" });
    await waitText(page, TEAM);
    const rows = await page.evaluate(() => document.querySelectorAll("tr").length);
    assert.ok(rows > 1, "the table has no rows");
    return `${rows - 1} entries`;
  });

  await step("the public share card renders on its own url", async () => {
    await page.goto(`${base}/t/${entryRef}`, { waitUntil: "networkidle0" });
    const text = await bodyText(page);
    assert.ok(text.includes(TEAM), "the team name is missing from the public card");
    assert.ok(/(points|pts)/i.test(text), "the public card shows no points");
    assert.ok(/#\d|rank/i.test(text), "the public card shows no rank");
  });

  await step("they make a free transfer in the open window", async () => {
    await page.goto(`${base}/team/transfers`, { waitUntil: "networkidle0" });
    const dropped = await page.evaluate(() => {
      const button = [...document.querySelectorAll("section button")].find((node) => node.querySelector("span span"));
      if (!button) return false;
      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    });
    assert.ok(dropped, "no players on the transfer page");
    await clickText(page, "Swap in");
    await waitText(page, "that change was", 20_000);
    const text = await bodyText(page);
    assert.ok(/free|−4|\b4 points\b/.test(text), "the swap did not say what it cost");
    assert.ok(/transfer history/i.test(text), "the swap is not in the history");
    return "one swap, free in the pre-lock window";
  });

  await step("social sign-in matches what this deployment offers", async () => {
    const providers = await (await fetch(`${base}/api/auth/providers`)).json();
    await page.goto(`${base}/account`, { waitUntil: "networkidle0" });
    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="/api/auth/"]')].map((node) => node.getAttribute("href")),
    );
    assert.equal(
      buttons.length,
      providers.providers.length,
      `the page shows ${buttons.length} provider buttons but the API offers ${providers.providers.length}`,
    );
    for (const href of buttons) assert.match(href, /\/api\/auth\/[a-z]+\/start\?next=/);
    return providers.providers.length === 0 ? "none configured, none shown" : providers.providers.map((p) => p.id).join(", ");
  });

  await step("they sign out and back in with a one-time email link", async () => {
    await page.goto(`${base}/account`, { waitUntil: "networkidle0" });
    await clickText(page, "Sign out");
    await waitText(page, "Email me a link", 20_000);
    await fill(page, 'input[type="email"]', EMAIL);
    await clickText(page, "Email me a link");
    await waitText(page, "sign-in link is on its way", 20_000);

    // The message is really sent — to the outbox, since there is no mail provider.
    const href = await readSignInLink();
    assert.ok(href, "no sign-in email arrived in the outbox");
    // The link may name the app's configured URL; follow it on the server under
    // test instead, which is the same app.
    const link = href.startsWith("http") ? href : `${base}${href}`;
    const target = new URL(link);
    await page.goto(`${base}${target.pathname}${target.search}`, { waitUntil: "networkidle0" });
    await waitText(page, entryRef, 20_000);
    return "same entry, same ref";
  });

  await step("nothing threw in the browser while all of that happened", async () => {
    const real = consoleErrors.filter(
      (error) => !/favicon|Download the React DevTools|hydration/i.test(error),
    );
    assert.deepEqual(real, [], `console errors:\n${real.join("\n")}`);
    return "clean console";
  });

  await browser.close();
  if (server) server.kill("SIGTERM");

  log(`\n${passed}/${total} end-to-end steps passed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  ${failure.step}\n    ${failure.error}`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(`\nThe run stopped: ${error instanceof Error ? error.message : error}`);
  if (currentPage) {
    const shots = path.join(ROOT, ".data", "e2e-shots");
    fs.mkdirSync(shots, { recursive: true });
    await currentPage.screenshot({ path: path.join(shots, "failure.png"), fullPage: true }).catch(() => {});
    console.error(`Screenshot: ${path.relative(ROOT, path.join(shots, "failure.png"))}`);
  }
  if (browserHandle) await browserHandle.close().catch(() => {});
  if (server) server.kill("SIGTERM");
  process.exitCode = 1;
});

// A hung page must not hang the installer: nothing here is meant to take more
// than a few minutes.
setTimeout(() => {
  console.error("\nThe end-to-end run timed out after 8 minutes.");
  if (server) server.kill("SIGKILL");
  process.exit(1);
}, 8 * 60 * 1000).unref();
