// Writes a fresh random-noise MJPEG for Chromium's fake camera before every run. Chromium's built-in fake
// stream looks the same each run, and the server correctly rejects it as a near-duplicate (dHash).
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";

export const FAKE_VIDEO = new URL("../test-results/fake-camera.mjpeg", import.meta.url).pathname;

export default async function globalSetup() {
  const frames: Buffer[] = [];
  for (let i = 0; i < 3; i++) {
    const w = 640;
    const h = 480;
    frames.push(
      await sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } })
        .jpeg({ quality: 80 })
        .toBuffer(),
    );
  }
  mkdirSync(dirname(FAKE_VIDEO), { recursive: true });
  writeFileSync(FAKE_VIDEO, Buffer.concat(frames));
}
