/**
 * Turns screencast frames into constant-frame-rate H.264 video.
 *
 *   FFMPEG=/path/to/ffmpeg node encode.mjs
 *
 * Each frame carries the real gap before it, written as durations in a concat
 * list, so playback matches the wall-clock pacing of the recording rather than
 * the browser's repaint cadence.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const RUN = process.env.OUT ?? path.join(process.cwd(), "run");
const OUTDIR = path.join(RUN, "videos");
fs.mkdirSync(OUTDIR, { recursive: true });

const JOBS = [
  ["01-desktop", "01-end-to-end-desktop.mp4"],
  ["02-mobile", "02-mobile-flow.mp4"],
  ["03-live", "03-live-simulation.mp4"],
];

for (const [dir, name] of JOBS) {
  const frames = path.join(RUN, "frames", dir);
  if (!fs.existsSync(path.join(frames, "timing.json"))) {
    console.log(`skipping ${dir} — no timing.json`);
    continue;
  }
  const timing = JSON.parse(fs.readFileSync(path.join(frames, "timing.json"), "utf8"));
  if (timing.length === 0) {
    console.log(`skipping ${dir} — no frames`);
    continue;
  }

  const lines = [];
  let total = 0;
  timing.forEach(([file, delta], index) => {
    const duration = Math.max(index === 0 ? 0 : delta, 40) / 1000;
    total += duration;
    lines.push(`file '${file}'`, `duration ${duration.toFixed(3)}`);
  });
  lines.push(`file '${timing[timing.length - 1][0]}'`);

  const list = path.join(frames, "list.txt");
  fs.writeFileSync(list, lines.join("\n") + "\n");
  const target = path.join(OUTDIR, name);
  execFileSync(
    FFMPEG,
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", list,
      "-fps_mode", "cfr", "-r", "30",
      "-c:v", "libx264", "-preset", "medium", "-crf", "24",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      target,
    ],
    { stdio: "inherit" },
  );
  console.log(`${name}: ${timing.length} frames, ${total.toFixed(1)}s, ${(fs.statSync(target).size / 1e6).toFixed(2)} MB`);
}
