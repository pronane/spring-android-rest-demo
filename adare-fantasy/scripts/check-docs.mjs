#!/usr/bin/env node
/**
 * The GitHub Pages gallery has no build step, so this is its build step.
 *
 *   npm run docs:check
 *
 * Fails if `docs/index.html` points at an image that is not committed, if the
 * snapshot JSON is not valid, or if the page has grown large enough that Pages
 * would be slow to serve it. Runs in CI and in the Pages workflow.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "docs");
const problems = [];

function read(relative) {
  const full = path.join(DOCS, relative);
  if (!fs.existsSync(full)) {
    problems.push(`missing docs/${relative}`);
    return null;
  }
  return fs.readFileSync(full, "utf8");
}

const html = read("index.html");

if (html) {
  const images = [...html.matchAll(/src="(img\/[^"]+)"/g)].map((match) => match[1]);
  if (images.length < 8) problems.push(`index.html references ${images.length} screenshots, expected at least 8`);

  for (const src of images) {
    if (!fs.existsSync(path.join(DOCS, src))) problems.push(`index.html points at docs/${src}, which is not in the repo`);
  }

  // Everything else the page needs must be relative — an absolute URL would
  // break the moment the site is served from a subpath (user.github.io/repo/).
  for (const [, href] of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    if (href.includes("github.io")) problems.push(`index.html links to a deployed site (${href}) — that belongs in DEPLOY.md`);
  }

  // A static page has no cache-busting story; keep it small enough to render fast.
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > 64 * 1024) problems.push(`index.html is ${Math.round(bytes / 1024)}KB — keep the gallery under 64KB`);
}

for (const name of ["leaderboard", "health"]) {
  const raw = read(`data/${name}.json`);
  if (!raw) continue;
  try {
    const parsed = JSON.parse(raw);
    if (name === "leaderboard" && !Array.isArray(parsed.leaderboard)) {
      problems.push("docs/data/leaderboard.json has no `leaderboard` array — re-run `npm run snapshot`");
    }
  } catch (error) {
    problems.push(`docs/data/${name}.json is not valid JSON: ${error.message}`);
  }
}

const images = fs.existsSync(path.join(DOCS, "img")) ? fs.readdirSync(path.join(DOCS, "img")) : [];
const total = images.reduce((sum, file) => sum + fs.statSync(path.join(DOCS, "img", file)).size, 0);
if (total > 3 * 1024 * 1024) problems.push(`docs/img is ${(total / 1024 / 1024).toFixed(1)}MB — trim the gallery before publishing`);

if (problems.length) {
  console.error("The static gallery is not ready to publish:\n");
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log(`Gallery ok — ${images.length} screenshots (${(total / 1024 / 1024).toFixed(1)}MB), snapshot JSON valid.`);
