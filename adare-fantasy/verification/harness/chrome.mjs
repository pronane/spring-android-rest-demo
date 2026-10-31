/**
 * Shared Chromium helpers for the verification scripts.
 *
 * The binaries used in the recorded run were @sparticuz/chromium's build, which
 * needs its shared libraries on LD_LIBRARY_PATH before launch. Both paths can
 * be overridden:
 *
 *   CHROME_PATH=/usr/bin/chromium node record.mjs
 *   CHROME_LIBS=/path/to/chromium/libs node record.mjs
 */
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

export async function launch({ width = 1280, height = 800 } = {}) {
  if (process.env.CHROME_LIBS) {
    process.env.LD_LIBRARY_PATH = `${process.env.CHROME_LIBS}:${process.env.LD_LIBRARY_PATH ?? ""}`;
  }
  const executablePath = process.env.CHROME_PATH ?? (await chromium.executablePath());
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Chromium not found at ${executablePath} — set CHROME_PATH or run "npx puppeteer browsers install chrome"`);
  }
  return puppeteer.launch({
    args: [...chromium.args, "--no-sandbox"],
    executablePath,
    defaultViewport: { width, height, deviceScaleFactor: 1 },
  });
}

/**
 * Records a page over the DevTools screencast protocol. Frames are written as
 * JPEGs with the millisecond gap before each one, which `encode.mjs` turns back
 * into a constant-frame-rate video.
 */
export async function startScreencast(page, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const client = await page.createCDPSession();
  const stamps = [];
  let index = 0;
  let last = Date.now();

  client.on("Page.screencastFrame", async ({ data, sessionId }) => {
    const now = Date.now();
    const file = String(index++).padStart(5, "0") + ".jpg";
    fs.writeFileSync(path.join(dir, file), Buffer.from(data, "base64"));
    stamps.push([file, now - last]);
    last = now;
    try {
      await client.send("Page.screencastFrameAck", { sessionId });
    } catch {
      /* the browser may be closing */
    }
  });
  await client.send("Page.startScreencast", { format: "jpeg", quality: 82, everyNthFrame: 1 });

  return {
    async stop() {
      await client.send("Page.stopScreencast").catch(() => {});
      await new Promise((r) => setTimeout(r, 200));
      fs.writeFileSync(path.join(dir, "timing.json"), JSON.stringify(stamps));
      const total = stamps.reduce((sum, [, delta]) => sum + delta, 0);
      return { frames: stamps.length, seconds: total / 1000 };
    },
  };
}
