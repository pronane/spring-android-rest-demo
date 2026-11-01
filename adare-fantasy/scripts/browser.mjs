/**
 * Finding a Chrome to drive, on macOS, Linux and Windows.
 *
 * `scripts/e2e.mjs` needs a real browser. Rather than downloading one on every
 * `npm install`, it looks for the browser the machine already has — Chrome,
 * Edge, Chromium or Brave — then for one puppeteer has cached, then for the
 * Linux build that ships with `@sparticuz/chromium` if it happens to be
 * installed (the verification harness uses it). `CHROME_PATH` wins over all of
 * that, and `CHROME_LIBS` puts extra shared libraries on the loader path (the
 * bundled Linux build needs its own).
 *
 * If nothing is found the error says exactly what to run:
 *
 *   npx @puppeteer/browsers install chrome@stable
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const exists = (file) => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

function systemBrowsers() {
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    ];
  }
  if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
      .filter(Boolean);
    return roots.flatMap((root) => [
      path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(root, "Chromium", "Application", "chrome.exe"),
    ]);
  }
  // Linux: ask PATH first, then look in the usual places.
  const found = [];
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    const which = spawnSync("which", [name], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim()) found.push(which.stdout.trim());
  }
  found.push(
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
  );
  return found;
}

function puppeteerCache() {
  const roots = [
    process.env.PUPPETEER_CACHE_DIR,
    path.join(os.homedir(), ".cache", "puppeteer"),
    path.join(os.homedir(), "Library", "Caches", "puppeteer"),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "puppeteer") : null,
  ].filter(Boolean);

  const out = [];
  for (const root of roots) {
    const chromeDir = path.join(root, "chrome");
    if (!fs.existsSync(chromeDir)) continue;
    for (const version of fs.readdirSync(chromeDir)) {
      out.push(
        path.join(chromeDir, version, "chrome-linux64", "chrome"),
        path.join(chromeDir, version, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
        path.join(chromeDir, version, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
        path.join(chromeDir, version, "chrome-win64", "chrome.exe"),
      );
    }
  }
  return out;
}

async function bundledChromium() {
  try {
    const module = await import("@sparticuz/chromium");
    const chromium = module.default ?? module;
    const executablePath = await chromium.executablePath();
    if (exists(executablePath)) return { executablePath, args: chromium.args ?? [] };
  } catch {
    /* not installed, or a build for another platform */
  }
  return null;
}

/** The first usable browser, with the extra flags it needs. */
export async function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) {
      throw new Error(`CHROME_PATH is set to ${process.env.CHROME_PATH}, which does not exist.`);
    }
    return { executablePath: process.env.CHROME_PATH, args: [] };
  }
  for (const candidate of [...systemBrowsers(), ...puppeteerCache()]) {
    if (exists(candidate)) return { executablePath: candidate, args: [] };
  }
  const bundled = await bundledChromium();
  if (bundled) return bundled;
  return null;
}

/**
 * Launches the browser. `headed` opens a visible window (for watching the test
 * run); the default is headless, which is what CI and the installer use.
 */
export async function launchBrowser({ headed = false, width = 1440, height = 900 } = {}) {
  const found = await findBrowser();
  if (!found) {
    throw new Error(
      "No browser found for the end-to-end test.\n\n" +
        "  Install Chrome or Edge, or let puppeteer fetch one:\n" +
        "    npx @puppeteer/browsers install chrome@stable\n" +
        "  …or point at a browser you already have:\n" +
        "    CHROME_PATH=/path/to/chrome npm run e2e\n",
    );
  }
  if (process.env.CHROME_LIBS) {
    process.env.LD_LIBRARY_PATH = `${process.env.CHROME_LIBS}:${process.env.LD_LIBRARY_PATH ?? ""}`;
  }
  const puppeteer = await import("puppeteer-core");
  const launch = puppeteer.default?.launch ?? puppeteer.launch;
  return launch({
    executablePath: found.executablePath,
    headless: !headed,
    defaultViewport: { width, height, deviceScaleFactor: 1 },
    args: [...(found.args ?? []), "--no-sandbox", "--disable-dev-shm-usage"],
  });
}
