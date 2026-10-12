// Extra screens for the 2026-10-12 pitch: the public proof page after "Compare with the record on Solana",
// and the developers page at "Connecting from each AI". Usage: node shots2.mjs [baseUrl]
import { chromium } from "playwright";

const D = import.meta.dirname;
const BASE = process.argv[2] ?? "https://proofmarket.fun";
const PROOF_ID = "ver_01M42M6WXZ93MFR3YDQZ7JXEHG";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

await p.goto(`${BASE}/en/r/${PROOF_ID}`, { waitUntil: "networkidle", timeout: 120_000 });
await p.evaluate(() => {
  for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
});
const btn = p.getByRole("button", { name: /Compare with the record on Solana/ }).first();
await btn.scrollIntoViewIfNeeded();
await btn.click();
await p
  .waitForFunction(() => document.body.innerText.includes("This page matches the record on Solana"), null, {
    timeout: 30_000,
  })
  .catch(() => console.error("compare did not finish"));
await p.waitForTimeout(500);
// The card that holds the compare result.
const box = async (text) =>
  p.evaluateHandle((t) => {
    const all = [...document.querySelectorAll("*")].filter(
      (e) => e.offsetParent !== null && e.textContent.includes(t),
    );
    const inner = all.find((e) => ![...e.children].some((c) => c.textContent.includes(t)));
    return inner?.closest("section, div[class*='rounded']") ?? inner;
  }, text);
await (await box("This page matches the record on Solana"))
  .asElement()
  .screenshot({ path: `${D}/assets/proof-compare.png` });
// The top of the page: "Verified by a person".
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(300);
await (await box("Verified by a person")).asElement().screenshot({ path: `${D}/assets/proof-top.png` });

await p.setViewportSize({ width: 1440, height: 1000 });
await p.goto(`${BASE}/en/developers`, { waitUntil: "networkidle", timeout: 120_000 });
const h = p.getByText("Connecting from each AI").first();
await h.scrollIntoViewIfNeeded();
await p.evaluate(() => window.scrollBy(0, -30));
await p.waitForTimeout(500);
await p.screenshot({ path: `${D}/assets/dev-clients.png` });
await b.close();
console.log("done");
