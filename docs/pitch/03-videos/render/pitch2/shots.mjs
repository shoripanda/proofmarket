// Capture the real screens used by scene.html into assets/ (phone-NN / agent-NN every 1.5 s of /en/try autoplay,
// plus home, dev-mcp, map-only). Usage: node shots.mjs [baseUrl]
import { chromium } from "playwright";

const D = import.meta.dirname;
const BASE = process.argv[2] ?? "https://proofmarket.fun";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

await p.goto(`${BASE}/en`, { waitUntil: "networkidle" });
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${D}/assets/home.png` });

await p.goto(`${BASE}/en/developers`, { waitUntil: "networkidle" });
await p.getByText("Three ways in").first().scrollIntoViewIfNeeded();
await p.evaluate(() => window.scrollBy(0, -40));
await p.waitForTimeout(500);
await p.screenshot({ path: `${D}/assets/dev-mcp.png` });

await p.setViewportSize({ width: 1400, height: 900 });
await p.goto(`${BASE}/en/map`, { waitUntil: "networkidle" });
const map = p.locator(".leaflet-container").first();
await map.evaluate((e) => {
  e.style.height = "860px";
  e.style.width = "1360px";
  window.dispatchEvent(new Event("resize"));
});
await p.waitForTimeout(4000);
await map.screenshot({ path: `${D}/assets/map-only.png` });

// /en/try autoplay: the phone frame and the agent section every 1.5 s. scene.html uses phone-04/06/10/14/18/22/29,
// agent-04 (request card) and agent-27 (result card), cropped below.
await p.setViewportSize({ width: 1600, height: 1000 });
await p.goto(`${BASE}/en/try`, { waitUntil: "networkidle" });
const phone = p.locator("div.rounded-\\[2rem\\].border-8").first();
const agent = p.locator("main section").first();
await phone.scrollIntoViewIfNeeded();
for (let i = 0; i < 30; i++) {
  await p.waitForTimeout(1500);
  const n = String(i).padStart(2, "0");
  await phone.screenshot({ path: `${D}/assets/phone-${n}.png` });
  await agent.screenshot({ path: `${D}/assets/agent-${n}.png` });
}
await b.close();
console.log(
  "done; now crop: ffmpeg -i assets/agent-04.png -vf crop=1240:1400:0:846 assets/agent-request.png (and agent-27 -> agent-result.png); copy apps/web/public/icon-512.png to assets/logo.png",
);
