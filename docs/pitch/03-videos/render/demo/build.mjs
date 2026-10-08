// Technical demo at 1920x1080: record /en/try autoplay with subtitles drawn into the page itself, add title and
// end cards, mix the Kokoro narration at the moments the screen reached each step.
// Usage: node build.mjs <voice> <out.mp4>   (dev server on http://localhost:3917)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const D = import.meta.dirname;
const TTS = process.env.KOKORO_DIR ?? `${import.meta.dirname}/../tts`;
const [voice, out] = process.argv.slice(2);
const lines = fs.readFileSync(`${D}/narration.txt`, "utf8").split("\n").filter(Boolean);
const TITLE_S = 3;
// What on screen starts each narration line (line 1 starts with the recording, line 6 runs over the end card).
const MARKERS = [
  null,
  "2. A worker claims it",
  "3. Shoot, answer, AI reviews",
  "attempt 2",
  "4. Final and paid",
];

const ff = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
const dur = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));

// 1. narration
for (let i = 0; i < lines.length; i++) {
  fs.writeFileSync(`${D}/line${i + 1}.txt`, lines[i]);
  execFileSync(
    `${TTS}/.venv/bin/python`,
    [`${TTS}/say.py`, voice, `${D}/cue${i + 1}.wav`, `${D}/line${i + 1}.txt`, "1.0"],
    { cwd: TTS, stdio: "inherit" },
  );
}
const cues = lines.map((_, i) => ({
  file: `${D}/cue${i + 1}.wav`,
  len: dur(`${D}/cue${i + 1}.wav`),
  start: 0,
}));

// 2. recording: subtitles are a fixed bar inside the page, switched when the screen reaches each marker
const SUB_CSS = `#pm-sub{position:fixed;left:0;right:0;bottom:0;height:150px;display:flex;align-items:center;justify-content:center;z-index:9999;pointer-events:none;font-family:-apple-system,"Helvetica Neue",Inter,Arial,sans-serif}
#pm-sub span{max-width:1700px;background:rgba(15,23,42,.82);color:#fff;font-size:34px;line-height:1.35;padding:16px 30px;border-radius:14px;text-align:center}
#pm-sub:empty{display:none}`;
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: `${D}/rec`, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3917/en/try", { waitUntil: "networkidle" });
await page.addStyleTag({ content: SUB_CSS });
await page.evaluate(() => {
  const d = document.createElement("div");
  d.id = "pm-sub";
  document.body.append(d);
});
const setSub = (text) =>
  page.evaluate((t) => {
    const d = document.getElementById("pm-sub");
    d.innerHTML = "";
    if (t) {
      const s = document.createElement("span");
      s.textContent = t;
      d.append(s);
    }
  }, text);
await page
  .getByRole("heading", { name: "Play", exact: true })
  .evaluate((el) => el.scrollIntoView({ block: "start" }));
await page.waitForTimeout(300);
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
// line 1 starts at once
cues[0].start = TITLE_S;
await setSub(lines[0]);
let nextLine = 1;
let subClearAt = TITLE_S + cues[0].len + 0.6;
const timers = [];
const schedule = (fn, atVideoTime) =>
  timers.push(setTimeout(fn, Math.max(0, (atVideoTime - TITLE_S - now()) * 1000)));
const showLine = (i, atVideoTime) => {
  cues[i].start = atVideoTime;
  schedule(() => setSub(lines[i]), atVideoTime);
  subClearAt = atVideoTime + cues[i].len + 0.6;
  schedule(() => {
    if (nextLine === i + 1) setSub("");
  }, subClearAt);
};
while (nextLine < MARKERS.length) {
  const text = await page.locator("body").innerText();
  const marker = MARKERS[nextLine];
  if (marker && text.includes(marker)) {
    const prevEnd = cues[nextLine - 1].start + cues[nextLine - 1].len + 0.4;
    showLine(nextLine, Math.max(TITLE_S + now(), prevEnd));
    nextLine++;
  }
  await page.waitForTimeout(100);
}
await page.getByRole("button", { name: "Play again" }).waitFor({ timeout: 120_000 });
// keep recording until the last on-screen line has been spoken, plus a beat
const lastEnd = cues[4].start + cues[4].len + 1.0;
while (TITLE_S + now() < lastEnd) await page.waitForTimeout(100);
await page.waitForTimeout(1500);
for (const t of timers) clearTimeout(t);
await ctx.close();
const webm = fs
  .readdirSync(`${D}/rec`)
  .filter((f) => f.endsWith(".webm"))
  .map((f) => `${D}/rec/${f}`)
  .sort((a, b2) => fs.statSync(b2).mtimeMs - fs.statSync(a).mtimeMs)[0];
const cardPage = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const k of ["start", "end"]) {
  await cardPage.goto(`file://${D}/card.html?k=${k}&sub=${encodeURIComponent(k === "end" ? lines[5] : "")}`);
  await cardPage.waitForTimeout(200);
  await cardPage.screenshot({ path: `${D}/card-${k}.png` });
}
await b.close();

// 3. assemble: title + recording + end card; the last line starts 0.8 s into the end card
const recDur = dur(webm);
cues[5].start = Math.max(TITLE_S + recDur + 0.8, cues[4].start + cues[4].len + 0.4);
const endS = cues[5].start + cues[5].len + 1.5 - TITLE_S - recDur;
ff([
  "-loop",
  "1",
  "-framerate",
  "30",
  "-t",
  String(TITLE_S),
  "-i",
  `${D}/card-start.png`,
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "17",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  `${D}/seg-start.mp4`,
]);
ff([
  "-i",
  webm,
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "17",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  "-an",
  `${D}/seg-rec.mp4`,
]);
ff([
  "-loop",
  "1",
  "-framerate",
  "30",
  "-t",
  endS.toFixed(2),
  "-i",
  `${D}/card-end.png`,
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "17",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  `${D}/seg-end.mp4`,
]);
fs.writeFileSync(
  `${D}/list.txt`,
  ["seg-start.mp4", "seg-rec.mp4", "seg-end.mp4"].map((f) => `file '${f}'`).join("\n") + "\n",
);
ff(["-f", "concat", "-safe", "0", "-i", `${D}/list.txt`, "-c", "copy", `${D}/video.mp4`]);
const videoDur = dur(`${D}/video.mp4`);

// 4. narration track: each cue delayed to its start, mixed, cut to the video length
const inputs = ["-i", `${D}/video.mp4`];
const fc = [];
for (let i = 0; i < cues.length; i++) {
  inputs.push("-i", cues[i].file);
  const ms = Math.round(cues[i].start * 1000);
  fc.push(`[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`);
}
fc.push(`${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0[aout]`);
ff([
  ...inputs,
  "-filter_complex",
  fc.join(";"),
  "-map",
  "0:v",
  "-map",
  "[aout]",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-t",
  videoDur.toFixed(2),
  "-movflags",
  "+faststart",
  out,
]);
console.log(JSON.stringify({ recDur, endS, cues: cues.map((c) => [c.start.toFixed(1), c.len.toFixed(1)]) }));
console.log("done", out, dur(out).toFixed(1), "s");
