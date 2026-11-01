/**
 * Renders `run/frames` + `run/cues.json` into the finished film:
 * VP9 video, burned-in caption bar, optional narration.
 *
 *   FFMPEG=/path/to/ffmpeg node demo/render-tour.mjs
 *   FFMPEG=… NARRATION=run/narration.json node demo/render-tour.mjs
 *
 * Captions are an ASS track, so they are real text at 1440×900 rather than a
 * picture of text: the film is readable at any size and re-renderable without
 * re-recording. `narration.json` is a list of { file, start } in seconds; the
 * clips are delayed into place and mixed to one Opus stream.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const RUN = process.env.OUT ?? path.join(ROOT, "run");
const FRAMES = path.join(RUN, "frames");
const TARGET = process.env.TARGET ?? path.join(ROOT, "twenty-eight-start-to-finish.webm");
const FONTS = process.env.FONTS ?? "/usr/share/fonts/truetype/dejavu";

const cues = JSON.parse(fs.readFileSync(path.join(RUN, "cues.json"), "utf8"));
const timing = JSON.parse(fs.readFileSync(path.join(FRAMES, "timing.json"), "utf8"));
if (!timing.length) throw new Error("no frames — run record-tour.mjs first");

/* ——— timing ——— */

const lines = [];
let total = 0;
timing.forEach(([file, delta], index) => {
  // Use the real gap between paints: clamping small gaps up to a floor would
  // stretch the film (26 captions drifted 22s late on the first render).
  const duration = (index === 0 ? 0 : Math.max(delta, 5)) / 1000;
  total += duration;
  lines.push(`file '${file}'`, `duration ${duration.toFixed(3)}`);
});
lines.push(`file '${timing[timing.length - 1][0]}'`);
const list = path.join(FRAMES, "list.txt");
fs.writeFileSync(list, lines.join("\n") + "\n");

/* ——— captions ——— */

const esc = (text) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\s+/g, " ")
    .trim();

/** Wrap to at most two lines that fit the 1330px caption column. */
function wrap(text, limit = 86) {
  if (text.length <= limit) return text;
  const words = text.split(" ");
  const first = [];
  const second = [];
  let count = 0;
  for (const word of words) {
    if (count + word.length + 1 <= limit && second.length === 0) {
      first.push(word);
      count += word.length + 1;
    } else {
      second.push(word);
    }
  }
  return `${first.join(" ")}\n${second.join(" ")}`.replace(/\n/g, "\\N");
}

const stamp = (seconds) => {
  const value = Math.max(0, seconds);
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = (value % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
};

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1440
PlayResY: 900
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Brand,DejaVu Sans,19,&H0079B7D8,&H0079B7D8,&H00000000,&H00000000,0,0,0,0,100,100,3,0,1,0,0,7,56,56,0,1
Style: Caption,DejaVu Sans,27,&H00E6F1F3,&H00E6F1F3,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,56,56,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const brand = `Dialogue: 0,${stamp(0.4)},${stamp(total)},Brand,,0,0,0,,{\\pos(56,790)}TWENTY-EIGHT  ·  ADARE 2027  ·  CUP FANTASY`;
const captions = cues
  .map((cue, index) => {
    const end = cue.end ?? cues[index + 1]?.start ?? total;
    return `Dialogue: 1,${stamp(cue.start)},${stamp(end)},Caption,,0,0,0,,{\\fad(140,140)\\pos(56,816)}${wrap(esc(cue.text))}`;
  })
  .join("\n");

const assFile = path.join(RUN, "captions.ass");
fs.writeFileSync(assFile, `${ass}${brand}\n${captions}\n`);

/* ——— narration ——— */

const narrationFile = process.env.NARRATION ?? path.join(RUN, "narration.json");
// The clips can live next to the script (demo/narration) rather than in run/.
const narrationDir = process.env.NARRATION_DIR ?? path.join(RUN, "narration");
const narration = fs.existsSync(narrationFile) ? JSON.parse(fs.readFileSync(narrationFile, "utf8")) : [];
const clips = narration.filter((clip) => fs.existsSync(path.join(narrationDir, clip.file)));
const hasNarration = clips.length > 0;

/* ——— render ——— */

const filters = [
  // Lower third: a near-black band, then the caption track on top of it.
  "drawbox=x=0:y=772:w=1440:h=128:color=0x06140D@0.97:t=fill",
  "drawbox=x=0:y=772:w=1440:h=1:color=0xC9A44E@0.6:t=fill",
  `ass=${assFile.replace(/\\/g, "/")}:fontsdir=${FONTS}`,
].join(",");

const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list];

if (hasNarration) {
  for (const clip of clips) args.push("-i", path.join(narrationDir, clip.file));
  const delays = clips
    .map((clip, index) => `[${index + 1}:a]adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${index}]`)
    .join(";");
  const mix = clips.map((_, index) => `[a${index}]`).join("");
  args.push(
    "-filter_complex",
    `${delays};${mix}amix=inputs=${clips.length}:duration=longest:normalize=0,alimiter=limit=0.95[aout]`,
    "-map", "0:v", "-map", "[aout]",
    "-c:a", "libopus", "-b:a", "96k", "-ar", "48000",
  );
}

args.push(
  "-vf", filters,
  "-fps_mode", "cfr", "-r", "30",
  "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "35",
  "-row-mt", "1", "-deadline", "good", "-cpu-used", "3",
  "-pix_fmt", "yuv420p",
  "-metadata", "title=Twenty-Eight — start to finish (Adare 2027)",
  TARGET,
);

execFileSync(FFMPEG, args, { stdio: "inherit" });

const size = fs.statSync(TARGET).size;
console.log(
  `${path.basename(TARGET)}: ${total.toFixed(1)}s, ${cues.length} captions, ` +
    `${hasNarration ? `${clips.length} narration clips` : "silent"}, ${(size / 1e6).toFixed(2)} MB`,
);
