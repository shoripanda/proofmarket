// Pitch video at 1920x1080: one slide per narration line, Kokoro narration, concat. Usage: node build.mjs <voiceDir> <out.mp4>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const P = import.meta.dirname;
const [voiceDir, out] = process.argv.slice(2);
const lines = fs.readFileSync(`${P}/narration.txt`, "utf8").split("\n").filter(Boolean);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (let i = 0; i < lines.length; i++) {
  await p.goto(`file://${P}/slide.html?k=${i + 1}&sub=${encodeURIComponent(lines[i])}`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${P}/slide${i + 1}.png` });
}
await b.close();
const ff = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
let total = 0;
for (let i = 1; i <= lines.length; i++) {
  const cue = `${voiceDir}/cue${i}.wav`;
  const dur = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", cue]),
  );
  total += dur + 0.7;
  // 0.7 s of silence after each line; high quality, still image, 30 fps.
  ff([
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    `${P}/slide${i}.png`,
    "-i",
    cue,
    "-af",
    "apad=pad_dur=0.7",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "17",
    "-tune",
    "stillimage",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-shortest",
    `${P}/seg${i}.mp4`,
  ]);
}
fs.writeFileSync(`${P}/list.txt`, lines.map((_, i) => `file 'seg${i + 1}.mp4'`).join("\n") + "\n");
ff(["-f", "concat", "-safe", "0", "-i", `${P}/list.txt`, "-c", "copy", "-movflags", "+faststart", out]);
console.log("done", out, "approx", total.toFixed(1), "s");
