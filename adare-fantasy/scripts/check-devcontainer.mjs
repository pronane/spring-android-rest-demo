#!/usr/bin/env node
/**
 * The "open it in a Codespace" promise, checked.
 *
 *   npm run devcontainer:check
 *
 * A devcontainer is the one thing in this repository that cannot be tested by
 * running it: it only runs when somebody creates a codespace. What can be tested
 * is that the configuration still says what GO-LIVE.md claims — dependencies and
 * the schema and the demo data on create, the app starting on attach, port 3000
 * forwarded and *public*, and bind-mounted storage for the database file. The
 * rest is a comment on the pull request, not a checkbox here.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const FILE = path.join(ROOT, ".devcontainer", "devcontainer.json");
const problems = [];

if (!fs.existsSync(FILE)) {
  console.error("No .devcontainer/devcontainer.json — the Codespace route in GO-LIVE.md would not work.");
  process.exit(1);
}

/** devcontainer.json is JSONC: strip comments and trailing commas before parsing. */
function parseJsonc(text) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inLine) {
      if (char === "\n") {
        inLine = false;
        out += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === "*" && next === "/") {
        inBlock = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === "\\") {
        out += next;
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLine = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlock = true;
      index += 1;
      continue;
    }
    out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

let config;
try {
  config = parseJsonc(fs.readFileSync(FILE, "utf8"));
} catch (error) {
  console.error(`.devcontainer/devcontainer.json does not parse: ${error.message}`);
  process.exit(1);
}

const create = config.postCreateCommand ?? "";
for (const [needle, why] of [
  ["npm ci", "dependencies"],
  ["db:migrate", "the schema"],
  ["seed", "the demo entries"],
  ["build", "the production build"],
]) {
  if (!create.includes(needle)) problems.push(`postCreateCommand no longer runs ${needle} (${why})`);
}

if (!String(config.postStartCommand ?? "").includes("start:local")) {
  problems.push("postStartCommand does not start the app — the port would answer nothing");
}

const ports = config.forwardPorts ?? [];
if (!ports.includes(3000)) problems.push("port 3000 is not forwarded");
const attributes = config.portsAttributes?.["3000"] ?? {};
if (attributes.visibility !== "public") {
  problems.push('port 3000 is not "visibility": "public" — the forwarded URL would only work for you');
}

const env = config.containerEnv ?? {};
if (!String(env.LIBSQL_URL ?? "").startsWith("file:")) {
  problems.push("containerEnv has no LIBSQL_URL file: store — the codespace would fall back to the JSON file");
}
if (!env.SESSION_SECRET) problems.push("containerEnv has no SESSION_SECRET — sign-in and checkout would 500");
if ((env.PAYMENTS_PROVIDER ?? "demo") !== "demo") {
  problems.push(`PAYMENTS_PROVIDER is "${env.PAYMENTS_PROVIDER}" — a public demo should be "demo"`);
}

if (problems.length > 0) {
  console.error("The Codespace one-click is broken:\n");
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log("devcontainer ok — install, migrate, seed and build on create; app on a public port 3000; SQLite in the workspace.");
