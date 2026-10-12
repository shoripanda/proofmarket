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
const HOLD = 1.0; // every piece of a scene is on screen for at least this long before the crossfade starts
const FADE = 0.45; // scene crossfade (scene.html)
const LEAD = 0.35; // the picture changes this much before the voice starts
const TAIL = 2.0; // seconds after the last line

const dur = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const lines = fs.readFileSync(`${D}/narration.txt`, "utf8").split("\n").filter(Boolean);
const cues = lines.map((text, i) => ({
  i,
  text,
  file: `${D}/voice/cue${i + 1}.wav`,
  len: dur(`${D}/voice/cue${i + 1}.wav`),
}));

// Scene i runs from start_i; its voice starts LEAD later (1.2 s for the opening). It ends HOLD after both the
// voice and the last piece of content (reported by scene.html after a first setup) are done, then crossfades.
function buildTimeline(holdAfterVoice) {
  let t = 0;
  const scenes = cues.map((c, i) => {
    const start = t;
    const voice = i === 0 ? 1.2 : start + LEAD;
    const contentEnd = Math.max(voice + c.len, voice + (holdAfterVoice[i] ?? 0));
    c.start = voice;
    t = contentEnd + HOLD + FADE;
    return { i, start, voice, end: voice + c.len, contentEnd };
  });
  const total = scenes.at(-1).contentEnd + TAIL;
  for (let i = 0; i < scenes.length; i++) scenes[i].next = scenes[i + 1]?.start ?? total;
  return { total, scenes };
}
const b = await chromium.launch();
// The layout is 1920x1080; the final render is drawn at 2x (3840x2160) so YouTube keeps small text sharp.
const SCALE = preview ? 1 : Number(process.env.RENDER_SCALE ?? 2);
const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE });
// Pass 1: voice-only timing, to learn when each scene's content has finished appearing (relative to its voice).
let timeline = buildTimeline([]);
await page.goto(`file://${D}/scene.html`);
await page.evaluate((tl) => window.setup(tl), timeline);
const ends = await page.evaluate(() => window.sceneEnds());
const offsets = timeline.scenes.map((s, i) => (ends[i] ?? s.voice) - s.voice);
// Pass 2: the real timeline, with the holds.
timeline = buildTimeline(offsets);
const total = timeline.total;
await page.goto(`file://${D}/scene.html`);
await page.evaluate((tl) => window.setup(tl), timeline);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
console.log(`total ${total.toFixed(1)} s, ${Math.ceil(total * FPS)} frames`);
console.log(timeline.scenes.map((s) => `${s.i}:${s.start.toFixed(1)}-${s.contentEnd.toFixed(1)}`).join(" "));

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
    preview ? "ultrafast" : "medium",
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
