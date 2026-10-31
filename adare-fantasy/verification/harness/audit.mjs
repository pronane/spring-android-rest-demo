/**
 * axe-core sweep: every route at mobile and desktop widths, with a paid entry
 * seeded into localStorage so member-only panels are audited too.
 *
 *   node audit.mjs        # writes axe-results.json
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./chrome.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = process.env.OUT ?? path.join(process.cwd(), "run");
const AXE = process.env.AXE ?? "axe-core/axe.min.js";
const source = fs.readFileSync(AXE.startsWith("/") ? AXE : path.join(process.cwd(), "node_modules", AXE), "utf8");

const ROUTES = ["/", "/account", "/admin", "/draft", "/editions", "/enter", "/leaderboard", "/leagues", "/live", "/pay/ORD-000000", "/pinpoint", "/players", "/predict", "/rules", "/team"];
const WIDTHS = [390, 1440];

const SEED = {
  v: 2,
  email: "audit@example.com",
  manager: "Audit Runner",
  teamName: "Audit FC",
  mode: "full",
  squad: ["rory", "rahm", "aberg", "hovland", "lowry", "macintyre", "scheffler", "schauffele", "dechambeau", "morikawa", "thomas", "henley"],
  captain: "rory",
  predictions: {},
  awards: { mvp: "rory", topScorer: "scheffler", rookie: "rasmus" },
  entry: { paid: true, plan: "single", ref: "TE-AUD123-ADRE", amount: 10, paidAt: new Date().toISOString() },
};

const browser = await launch({ width: 1440, height: 1000 });
const results = [];

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width < 500 ? 844 : 1000 });
    await page.evaluateOnNewDocument((state) => {
      localStorage.setItem("twentyeight:v2", JSON.stringify(state));
    }, SEED);
    await page.goto(BASE + route, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(source);
    const violations = await page.evaluate(async () => {
      const { violations } = await window.axe.run(document, { resultTypes: ["violations"] });
      return violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    });
    results.push({ route, width, violations });
    console.log(`${violations.length === 0 ? "PASS" : "FAIL"}  ${route} @${width}${violations.length ? "  — " + violations.map((v) => v.id).join(", ") : ""}`);
    await page.close();
  }
}

await browser.close();
const clean = results.filter((r) => r.violations.length === 0).length;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "axe-results.json"), JSON.stringify({ base: BASE, clean, total: results.length, results }, null, 2));
console.log(`\n${clean}/${results.length} route/viewport checks have no axe violations`);
if (clean !== results.length) process.exitCode = 1;
