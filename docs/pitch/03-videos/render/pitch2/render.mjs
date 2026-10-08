// Deterministic render: scene.html exposes window.setup(timeline) and window.seek(t). Each frame is sought,
// screenshotted and piped into ffmpeg, so motion is smooth regardless of browser speed.
// Usage: node render.mjs <out.mp4> [music.mp3] [--preview]  (voice/cueN.wav must exist)
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const D = import.meta.dirname;
const [out, music] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const preview = process.argv.includes("--preview"); // 2 fps, no audio: for checking layout
const FPS = preview ? 2 : 30;
const GAP = 0.4; // silence between narration lines
const LEAD = 0.35; // the picture changes this much before the voice starts
const TAIL = 2.0; // seconds after the last line

const dur = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const lines = fs.readFileSync(`${D}/narration.txt`, "utf8").split("\n").filter(Boolean);
let t = 1.2; // the opening breathes before the first word
const cues = lines.map((text, i) => {
  const file = `${D}/voice/cue${i + 1}.wav`;
  const len = dur(file);
  const c = { i, text, file, len, start: t, sceneStart: t - LEAD };
  t += len + GAP;
  return c;
});
cues[0].sceneStart = 0;
const total = t - GAP + TAIL;
const timeline = {
  total,
  scenes: cues.map((c) => ({ start: c.sceneStart, voice: c.start, end: c.start + c.len })),
};
for (let i = 0; i < timeline.scenes.length; i++)
  timeline.scenes[i].next = timeline.scenes[i + 1]?.start ?? total;
console.log(`total ${total.toFixed(1)} s, ${Math.ceil(total * FPS)} frames`);

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${D}/scene.html`);
await page.evaluate((tl) => window.setup(tl), timeline);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

const silent = `${D}/silent.mp4`;
const ff = spawn(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(FPS),
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-preset",
    preview ? "ultrafast" : "slow",
    "-crf",
    preview ? "28" : "16",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    silent,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const frames = Math.ceil(total * FPS);
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  const tt = f / FPS;
  await page.evaluate((x) => window.seek(x), tt);
  const buf = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % (FPS * 10) === 0) console.log(`frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await b.close();
if (preview) {
  fs.renameSync(silent, out);
  console.log("preview", out);
  process.exit(0);
}

// audio: each line at its start, music under it
const inputs = ["-i", silent];
const parts = [];
cues.forEach((c, k) => {
  inputs.push("-i", c.file);
  const ms = Math.round(c.start * 1000);
  parts.push(`[${k + 1}]adelay=${ms}|${ms}[v${k}]`);
});
let graph =
  parts.join(";") +
  `;${cues.map((_, k) => `[v${k}]`).join("")}amix=inputs=${cues.length}:normalize=0,loudnorm=I=-17:TP=-1.5:LRA=9[voice]`;
let last = "[voice]";
if (music) {
  inputs.push("-i", music);
  const m = cues.length + 1;
  graph += `;[${m}]atrim=0:${total.toFixed(2)},volume=0.11,afade=t=in:d=2,afade=t=out:st=${(total - 4).toFixed(2)}:d=4[mus];[voice][mus]amix=inputs=2:normalize=0[mix]`;
  last = "[mix]";
}
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "0:v",
    "-map",
    last,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    total.toFixed(2),
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: "inherit" },
);
fs.unlinkSync(silent);
console.log("wrote", out, `${total.toFixed(1)} s`);
