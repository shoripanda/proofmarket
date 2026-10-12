// Technical demo v2 (2026-10-12): the screens fill the frame and the captions live in their own band.
//   stage   1920x900  — the page being used, with a camera that zooms onto the part in use and a visible tap
//   band    1920x180  — caption and step, never on top of the screen
// Scenes: title card → hook card → /en/try driven tap by tap (agent, then the worker's phone) → the real
// production proof page (live "Compare with the record on Solana") → the real settle transaction in Solana
// Explorer → end card. Narration: voice/<id>.wav (Kokoro, see README), text in narration.txt.
// Usage: PLAYWRIGHT=<path to playwright> node build.mjs <out.mp4>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? "playwright");
const D = import.meta.dirname;
const OUT = process.argv[2] ?? `${D}/out.mp4`;
const W = 1920;
const H = 900; // stage
const BAND = 180;
const BASE = process.env.PM_BASE ?? "https://proofmarket.fun";
const PROOF_ID = "ver_01M42M6WXZ93MFR3YDQZ7JXEHG";
const SETTLE_TX = "34sEPAZgPuad9ZGfmeuGJQE9miKmfW1MWrYyQ1jUadYL8GAU6jYbPYCwVDA1i8np99LoWBdrpE3ggckURrFUHcbt";
const GAP = 0.35;
const TMP = `${D}/tmp`;
fs.mkdirSync(TMP, { recursive: true });

const ff = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
const dur = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));

const LINES = Object.fromEntries(
  fs
    .readFileSync(`${D}/narration.txt`, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t")),
);
const LEN = Object.fromEntries(Object.keys(LINES).map((id) => [id, dur(`${D}/voice/${id}.wav`)]));
// The step shown in the band for each line.
const STEP = {
  hook: "",
  a1: "1 · The agent asks",
  a2: "2 · Escrow on Solana",
  w1: "3 · A person accepts",
  w2: "3 · A person acts",
  w3: "3 · A person answers",
  w4: "4 · Checks + AI review",
  w5: "4 · Sent back with a reason",
  w6: "4 · Fixed and resubmitted",
  w7: "5 · Recorded + paid on Solana",
  a3: "6 · Verified answer to the agent",
  p1: "Live in production",
  p2: "Live in production · verify on Solana",
  c1: "Solana Devnet · settle transaction",
  end: "",
};

const timeline = []; // { id, start } in final-video seconds
let clock = 0; // length of the stage video so far

const b = await chromium.launch();

// ---------- captions: one band image per line, plus an empty one ----------
async function renderBands() {
  const p = await b.newPage({ viewport: { width: W, height: BAND } });
  const html = (step, text) => `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:${W}px;height:${BAND}px;background:#0f172a;display:flex;align-items:center;gap:36px;
      padding:0 64px;box-sizing:border-box;font-family:-apple-system,"Helvetica Neue",Inter,Arial,sans-serif}
    .brand{color:#5eead4;font-weight:700;font-size:22px;letter-spacing:.02em;white-space:nowrap}
    .col{display:flex;flex-direction:column;gap:8px;flex:1}
    .step{align-self:flex-start;color:#0f172a;background:#5eead4;font-weight:700;font-size:20px;padding:4px 14px;border-radius:999px}
    .text{color:#fff;font-size:31px;line-height:1.32}
  </style><div class="brand">ProofMarket</div><div class="col">${step ? `<div class="step">${step}</div>` : ""}<div class="text">${text}</div></div>`;
  await p.setContent(html("", ""));
  await p.screenshot({ path: `${TMP}/band-empty.png` });
  for (const id of Object.keys(LINES)) {
    await p.setContent(html(STEP[id] ?? "", LINES[id]));
    await p.screenshot({ path: `${TMP}/band-${id}.png` });
  }
  await p.close();
}

// ---------- cards ----------
async function cardImage(name, inner) {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:${W}px;height:${H}px;background:linear-gradient(135deg,#0f766e,#134e4a);color:#fff;
      display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
      font-family:-apple-system,"Helvetica Neue",Inter,Arial,sans-serif}
    .eyebrow{font-size:24px;letter-spacing:.2em;opacity:.8}
    h1{font-size:96px;margin:18px 0 10px;letter-spacing:-.02em}
    h2{font-size:64px;line-height:1.15;margin:0 0 28px;max-width:1500px;letter-spacing:-.01em}
    p{font-size:34px;opacity:.92;margin:6px 0}
    .row{display:flex;gap:28px;margin-top:40px}
    .pill{font-size:30px;background:rgba(255,255,255,.14);padding:14px 28px;border-radius:999px}
    .url{font-size:40px;font-weight:700;margin-top:44px}
    .note{position:absolute;top:28px;right:40px;font-size:18px;opacity:.6}
  </style>${inner}`);
  await p.screenshot({ path: `${TMP}/card-${name}.png` });
  await p.close();
}

function stillSegment(name, seconds) {
  ff([
    "-loop",
    "1",
    "-framerate",
    "30",
    "-t",
    seconds.toFixed(2),
    "-i",
    `${TMP}/card-${name}.png`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    `${TMP}/seg-${name}.mp4`,
  ]);
  return `${TMP}/seg-${name}.mp4`;
}

// ---------- in-page helpers: camera, tap cursor, hiding demo-only text ----------
const HELPERS = ({ W, H, hide }) => {
  const root = document.documentElement;
  root.style.overflow = "hidden";
  root.style.background = getComputedStyle(document.body).backgroundColor || "#fff";
  window.scrollTo(0, 0);
  const body = document.body;
  body.style.transformOrigin = "0 0";
  body.style.transition = "transform 1000ms cubic-bezier(.4,0,.2,1)";
  body.style.willChange = "transform";
  let cam = { s: 1, x: 0, y: 0 };
  window.pmCam = (el, { pad = 40, max = 2, align = "center" } = {}) => {
    const r = el.getBoundingClientRect();
    const x = (r.left - cam.x) / cam.s;
    const y = (r.top - cam.y) / cam.s;
    const w = r.width / cam.s;
    const h = r.height / cam.s;
    const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h, max);
    const tx = W / 2 - s * (x + w / 2);
    const ty = align === "top" ? pad - s * y : H / 2 - s * (y + h / 2);
    cam = { s, x: tx, y: ty };
    body.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  };
  // Panels tagged data-pm (the agent, the phone) are faded out while the camera is on the other one, so
  // nothing half-visible with cut-off text remains at the edge of the frame.
  window.pmShow = (sel) => {
    for (const el of document.querySelectorAll("[data-pm]"))
      el.style.opacity = !sel || el.matches(sel) ? "1" : "0";
  };
  const cur = document.createElement("div");
  cur.id = "pm-cursor";
  cur.style.cssText =
    "position:fixed;left:-80px;top:-80px;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;" +
    "background:rgba(255,255,255,.55);border:4px solid #0f766e;box-shadow:0 4px 18px rgba(0,0,0,.35);" +
    "z-index:2147483647;pointer-events:none;transition:left 650ms cubic-bezier(.4,0,.2,1),top 650ms cubic-bezier(.4,0,.2,1),transform 160ms";
  root.append(cur);
  window.pmPoint = (el) => {
    const r = el.getBoundingClientRect();
    cur.style.left = `${r.left + r.width / 2}px`;
    cur.style.top = `${r.top + r.height / 2}px`;
  };
  window.pmRipple = () => {
    cur.style.transform = "scale(.7)";
    setTimeout(() => (cur.style.transform = "scale(1)"), 180);
    const rp = document.createElement("div");
    rp.style.cssText = `position:fixed;left:${cur.style.left};top:${cur.style.top};width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:4px solid #14b8a6;z-index:2147483646;pointer-events:none;transition:all 500ms ease-out;opacity:1`;
    root.append(rp);
    requestAnimationFrame(() => {
      rp.style.width = rp.style.height = "110px";
      rp.style.margin = "-55px 0 0 -55px";
      rp.style.opacity = "0";
    });
    setTimeout(() => rp.remove(), 600);
  };
  /** The innermost visible element that contains `text`. */
  window.pmFind = (text, within = document) => {
    const all = [...(within ?? document).querySelectorAll("*")].filter(
      (e) => e.offsetParent !== null && e.textContent.includes(text),
    );
    // A control whose label starts with the text wins over a sentence that merely mentions it.
    const control = all.find(
      (e) => e.matches("button,a,[role=button]") && e.textContent.trim().startsWith(text),
    );
    return control ?? all.find((e) => ![...e.children].some((c) => c.textContent.includes(text))) ?? null;
  };
  const sweep = () => {
    // Only the innermost element carrying a demo-only phrase, never a container around it.
    const hit = (t) => hide.some((h) => t.includes(h)) || t.includes("proofmarket.example");
    for (const el of document.querySelectorAll("p,div,span,a,li,button")) {
      if (!hit(el.textContent) || [...el.children].some((c) => hit(c.textContent))) continue;
      el.style.display = "none";
    }
  };
  sweep();
  new MutationObserver(sweep).observe(body, { childList: true, subtree: true, characterData: true });
};

/** Record one page. `run(api)` drives it; returns the trimmed segment and pushes its lines to the timeline. */
async function recordScene(
  name,
  url,
  { hide = [], prepare, run, viewport = { width: W, height: H }, scale = 1 },
) {
  const dir = `${TMP}/rec-${name}`;
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await b.newContext({
    viewport,
    deviceScaleFactor: scale,
    recordVideo: { dir, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  if (prepare) await prepare(page);
  await page.evaluate(HELPERS, { W: viewport.width, H: viewport.height, hide });
  await page.waitForTimeout(600);
  const t0 = Date.now(); // the segment starts here
  const local = []; // { id, at } seconds from t0
  let lastEnd = 0;
  const now = () => (Date.now() - t0) / 1000;
  const wait = (ms) => page.waitForTimeout(ms);
  const api = {
    page,
    wait,
    /** Start a narration line now (or when the previous one has finished, whichever is later). */
    async say(id) {
      if (now() < lastEnd + GAP) await wait((lastEnd + GAP - now()) * 1000);
      local.push({ id, at: now() });
      lastEnd = now() + LEN[id];
    },
    /** Wait until the current line has been spoken. */
    async done(extra = 0) {
      if (now() < lastEnd + extra) await wait((lastEnd + extra - now()) * 1000);
    },
    /** Move the camera onto an element. `show: "agent" | "phone" | "both"` picks which tagged panel stays visible. */
    async cam(find, opts) {
      const ok = await page.evaluate(
        ([f, o]) => {
          const el = new Function(`return (${f})`)()();
          if (el) window.pmCam(el, o);
          if (o?.show) window.pmShow(o.show === "both" ? null : `[data-pm="${o.show}"]`);
          return !!el;
        },
        [find.toString(), opts],
      );
      if (!ok) {
        console.error(`camera target not found in ${name}: ${find}`);
        await page.screenshot({ path: `${TMP}/miss-${name}-${Date.now()}.png` });
      }
      await wait(1100);
    },
    async tap(find) {
      const ok = await page.evaluate((f) => {
        const el = new Function(`return (${f})`)()();
        if (!el) return false;
        window.pmPoint(el);
        return true;
      }, find.toString());
      if (!ok) {
        await page.screenshot({ path: `${TMP}/miss-tap-${name}-${Date.now()}.png` });
        throw new Error(`tap target not found in ${name}: ${find}`);
      }
      await wait(800);
      await page.evaluate((f) => {
        const el = new Function(`return (${f})`)()();
        window.pmRipple();
        (el.closest("button,a,[role=button]") ?? el).click();
      }, find.toString());
      await wait(500);
    },
  };
  await run(api);
  await api.done(1.2);
  const closeAt = Date.now();
  await ctx.close();
  const webm = fs.readdirSync(dir).find((f) => f.endsWith(".webm"));
  const raw = `${dir}/${webm}`;
  const videoStart = closeAt - dur(raw) * 1000;
  const skip = Math.max(0, (t0 - videoStart) / 1000);
  const seg = `${TMP}/seg-${name}.mp4`;
  ff([
    "-ss",
    skip.toFixed(3),
    "-i",
    raw,
    "-vf",
    `scale=${W}:${H}:flags=lanczos,fps=30`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    "-an",
    seg,
  ]);
  for (const l of local) timeline.push({ id: l.id, start: clock + l.at });
  clock += dur(seg);
  return seg;
}

await renderBands();
await cardImage(
  "title",
  `<div class="note">Narration: synthesized voice</div><div class="eyebrow">TECHNICAL DEMO · CRYPTO WORLD'S FAIR 2026</div>
   <h1>ProofMarket</h1><p>Real-world checks for AI agents, done by people, settled on Solana</p>`,
);
await cardImage(
  "hook",
  `<h2>AI agents can read the whole web.<br>They can't walk to a shop and look.</h2>
   <div class="row"><span class="pill">① The agent asks</span><span class="pill">② A person checks</span><span class="pill">③ AI reviews</span><span class="pill">④ Paid on Solana</span></div>`,
);
await cardImage(
  "end",
  `<div class="eyebrow">PROOFMARKET</div><h2 style="margin-top:20px">Whatever your AI agent can't do itself,<br>ask a person.</h2>
   <p>Verified by people · Reviewed by AI · Settled on Solana</p><div class="url">proofmarket.fun</div>`,
);

const segs = [];
segs.push(stillSegment("title", 3));
clock = 3;
timeline.push({ id: "hook", start: clock + 0.4 });
const hookLen = 0.4 + LEN.hook + 0.8;
segs.push(stillSegment("hook", hookLen));
clock += hookLen;

// ---------- the walkthrough on /en/try ----------
const IN_PHONE = (t) =>
  `() => { const ph = document.querySelector('[class*="border-8"]'); return window.pmFind(${JSON.stringify(t)}, ph); }`;
const fn = (body) => new Function(`return ${body}`)();
segs.push(
  await recordScene("try", `${BASE}/en/try`, {
    hide: [
      "In production, Claude compares",
      "That is the end of the demo",
      "The answer reaches the user together",
      "(the demo shows a sample notice)",
      "Play again",
      "Try it against production",
    ],
    async prepare(page) {
      await page.getByRole("button", { name: "Stop and take over" }).click();
      await page.evaluate(() => {
        // Keep only the walkthrough: hide every sibling on the way up from it, its controls and the read-aloud.
        const flow = [...document.querySelectorAll("p")].find(
          (p) => p.textContent.trim() === "AI agent (the requester)",
        );
        const root = flow.closest(".space-y-6");
        for (let el = root; el && el !== document.body; el = el.parentElement)
          for (const sib of el.parentElement?.children ?? [])
            if (sib !== el && sib.tagName !== "SCRIPT") sib.style.display = "none";
        for (const c of root.children) {
          const t = c.textContent;
          if (
            t.includes("Stop and take over") ||
            t.includes("Resume autoplay") ||
            t.includes("Read the reasoning aloud")
          )
            c.style.display = "none";
        }
        root.style.padding = "24px";
        for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
        // The demo's answer shortcuts are hidden; the worker types instead.
        const pick = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Demo only"));
        if (pick) pick.parentElement.style.display = "none";
        // Tag the two panels so the camera can fade out the one it is not looking at (see pmShow).
        const agent = [...document.querySelectorAll("section")]
          .filter((s) => s.textContent.includes("AI agent (the requester)"))
          .at(-1);
        const ph = document.querySelector('[class*="border-8"]');
        const phoneWrap = ph.parentElement?.textContent.trim().startsWith("Worker's phone")
          ? ph.parentElement
          : ph;
        for (const [el, name] of [
          [agent, "agent"],
          [phoneWrap, "phone"],
        ]) {
          el.dataset.pm = name;
          el.style.transition = "opacity 600ms ease";
        }
      });
    },
    async run(x) {
      const agent = `() => [...document.querySelectorAll("section")].filter((s) => s.textContent.includes("AI agent (the requester)")).at(-1)`;
      const phone = `() => document.querySelector('[class*="border-8"]')`;
      const hidePick = () =>
        x.page.evaluate(() => {
          const p = [...document.querySelectorAll("p")].find((e) => e.textContent.startsWith("Demo only"));
          if (p) p.parentElement.style.display = "none";
        });
      const scrollPhone = (to) =>
        x.page.evaluate((t) => {
          const box = document.querySelector('[class*="border-8"] .overflow-y-auto');
          if (!box) return;
          box.style.scrollBehavior = "smooth";
          box.scrollTop = t === "bottom" ? box.scrollHeight : 0;
        }, to);

      await x.cam(fn(agent), { max: 1.75, pad: 30, show: "agent" });
      await x.say("a1");
      await x.wait(8200);
      await x.tap(fn(`() => window.pmFind("Send the request")`));
      await x.done();
      await x.say("a2");
      await x.wait(600);
      await x.cam(
        fn(
          `() => { const a = [...document.querySelectorAll("section")].filter((s) => s.textContent.includes("AI agent (the requester)")).at(-1); const q = window.pmFind("Transcribe the opening-hours notice", a); return q?.closest("div.rounded-2xl") ?? q; }`,
        ),
        { max: 1.9, pad: 40, show: "agent" },
      );
      await x.wait(5200);
      // Both panels: the escrow is funded on the left, the task has just arrived on the phone.
      await x.cam(fn(agent), { max: 1.75, pad: 30, show: "both" });
      await x.done();

      await x.cam(fn(phone), { max: 1.6, pad: 24, show: "phone" });
      await x.say("w1");
      await x.wait(2200);
      await x.tap(
        fn(
          `() => { const ph = document.querySelector('[class*="border-8"]'); return [...ph.querySelectorAll("button,a")].find((e) => e.textContent.includes("0.30")) ?? window.pmFind("Transcribe", ph); }`,
        ),
      );
      await x.wait(1300);
      await scrollPhone("bottom");
      await x.wait(500);
      await x.tap(fn(IN_PHONE("Claim this task")));
      await x.done();

      await x.say("w2");
      await x.wait(500);
      await scrollPhone("bottom");
      await x.tap(fn(IN_PHONE("I'm here")));
      await x.wait(900);
      await scrollPhone("bottom");
      await x.wait(500);
      await x.tap(fn(IN_PHONE("Take the photo")));
      await hidePick();
      await x.done();

      await hidePick();
      await x.say("w3");
      await scrollPhone("bottom");
      await x.wait(700);
      const typeAnswer = async (text) => {
        const box = fn(`() => document.querySelector('[class*="border-8"] textarea')`);
        await x.tap(box);
        await x.page.locator('[class*="border-8"] textarea').focus();
        for (const [i, line] of text.split("\n").entries()) {
          if (i) await x.page.keyboard.press("Enter");
          await x.page.keyboard.type(line, { delay: 38 });
        }
      };
      await typeAnswer("Open 11 to 8 on weekdays, until 6 on Saturdays, closed Sundays.");
      await scrollPhone("bottom");
      await x.wait(500);
      await x.tap(
        fn(
          `() => { const ph = document.querySelector('[class*="border-8"]'); return [...ph.querySelectorAll("button")].find((e) => e.textContent.trim() === "Submit"); }`,
        ),
      );
      await x.done();

      await x.say("w4");
      await x.done();
      await x.say("w5");
      await x.wait(LEN.w5 * 1000 - 600);
      await x.tap(fn(IN_PHONE("Retake")));
      await x.done();

      await x.say("w6");
      await x.wait(300);
      await scrollPhone("bottom");
      await x.tap(fn(IN_PHONE("Take the photo")));
      await hidePick();
      await scrollPhone("bottom");
      await x.wait(500);
      await typeAnswer(
        [
          "OPENING HOURS",
          "Mon–Fri 11:00–20:00",
          "Sat 11:00–18:00",
          "Closed Sun & holidays",
          "Last order 19:30",
        ].join("\n"),
      );
      await scrollPhone("bottom");
      await x.wait(400);
      await x.tap(
        fn(
          `() => { const ph = document.querySelector('[class*="border-8"]'); return [...ph.querySelectorAll("button")].find((e) => e.textContent.trim() === "Submit"); }`,
        ),
      );
      // w7 runs over the checks, so there is no silence while they tick through.
      await x.say("w7");
      await x.page.waitForFunction(() => document.body.textContent.includes("Received"), null, {
        timeout: 30_000,
      });
      await x.cam(fn(phone), { max: 1.6, pad: 24, show: "phone" });
      await x.done();

      await x.say("a3");
      await x.cam(
        fn(
          `() => { const e = window.pmFind("Someone just checked on the spot"); return e?.closest("div.rounded-2xl") ?? e?.parentElement; }`,
        ),
        { max: 1.9, pad: 40, show: "agent" },
      );
      await x.done(0.6);
    },
  }),
);

// ---------- the real result in production ----------
segs.push(
  await recordScene("proof", `${BASE}/en/r/${PROOF_ID}`, {
    hide: [],
    async prepare(page) {
      await page.evaluate(() => {
        for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
      });
    },
    async run(x) {
      const card = (t) =>
        `() => window.pmFind(${JSON.stringify(t)})?.closest("section, div[class*='rounded-2xl'], div[class*='rounded-3xl']")`;
      await x.cam(fn(card("Verified by a person")), { max: 1.6, pad: 40 });
      await x.say("p1");
      await x.wait(5200);
      await x.cam(fn(card("How it was checked")), { max: 1.6, pad: 40 });
      await x.done();
      await x.cam(fn(card("A record that cannot be rewritten")), { max: 1.5, pad: 40, align: "top" });
      await x.say("p2");
      await x.wait(1600);
      await x.tap(fn(`() => window.pmFind("Compare with the record on Solana")`));
      await x.page
        .waitForFunction(
          () => document.body.innerText.includes("This page matches the record on Solana"),
          null,
          { timeout: 20_000 },
        )
        .catch(() => console.error("compare did not finish"));
      await x.wait(300);
      await x.cam(
        fn(
          `() => window.pmFind("This page matches the record on Solana")?.closest("div[class*='rounded']") ?? window.pmFind("This page matches")`,
        ),
        { max: 2.2, pad: 30 },
      );
      await x.done(0.8);
    },
  }),
);

// ---------- the settle transaction in Solana Explorer ----------
// Explorer scrolls inside its own container, so the camera cannot follow it; show its real sections as stills.
{
  const p = await b.newPage({ viewport: { width: 1920, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(`https://explorer.solana.com/tx/${SETTLE_TX}?cluster=devnet`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await p.waitForFunction(() => document.body.innerText.includes("Instruction: Settle"), null, {
    timeout: 90_000,
  });
  await p.waitForTimeout(2000);
  const shots = [
    ["Summary", "summary"],
    ["Logs", "logs"],
    ["Tokens", "tokens"],
  ];
  for (const [h, k] of shots) {
    const sec = p.locator("section", { has: p.locator("h2", { hasText: new RegExp(`^${h}$`) }) }).first();
    await sec.scrollIntoViewIfNeeded();
    await sec.screenshot({ path: `${TMP}/ex-${k}.png` });
  }
  await p.close();
  const viewer = await b.newPage({ viewport: { width: W, height: H } });
  for (const [, k] of shots) {
    const img = fs.readFileSync(`${TMP}/ex-${k}.png`).toString("base64");
    await viewer.setContent(`<!doctype html><style>body{margin:0;width:${W}px;height:${H}px;background:#111827;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:-apple-system,Inter,Arial,sans-serif}
      .tag{color:#5eead4;font-size:24px;font-weight:700;letter-spacing:.04em}img{max-width:1860px;max-height:820px;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5)}</style>
      <div class="tag">explorer.solana.com · Devnet · tx ${SETTLE_TX.slice(0, 8)}…</div><img src="data:image/png;base64,${img}">`);
    await viewer.screenshot({ path: `${TMP}/card-ex-${k}.png` });
  }
  await viewer.close();
  timeline.push({ id: "c1", start: clock + 0.3 });
  const parts = [
    ["summary", 2.6],
    ["logs", 3.6],
    ["tokens", LEN.c1 + 1.3 - 2.6 - 3.6 + 0.3],
  ];
  for (const [k, sec] of parts) {
    segs.push(stillSegment(`ex-${k}`, sec));
    clock += sec;
  }
}

timeline.push({ id: "end", start: clock + 0.5 });
const endLen = 0.5 + LEN.end + 1.8;
segs.push(stillSegment("end", endLen));
clock += endLen;
await b.close();

// ---------- assemble: stage + band, captions while each line is spoken, narration ----------
fs.writeFileSync(`${TMP}/list.txt`, `${segs.map((s) => `file '${s}'`).join("\n")}\n`);
ff(["-f", "concat", "-safe", "0", "-i", `${TMP}/list.txt`, "-c", "copy", `${TMP}/stage.mp4`]);
const total = dur(`${TMP}/stage.mp4`);
const inputs = ["-i", `${TMP}/stage.mp4`, "-loop", "1", "-i", `${TMP}/band-empty.png`];
const fc = [`[0:v]pad=${W}:${H + BAND}:0:0:color=0x0f172a[v0]`, `[v0][1:v]overlay=0:${H}:shortest=1[v1]`];
let last = "v1";
timeline.forEach((c, i) => {
  inputs.push("-loop", "1", "-i", `${TMP}/band-${c.id}.png`);
  const next = timeline[i + 1];
  const end = Math.min(next ? next.start - 0.05 : total, c.start + LEN[c.id] + 0.6);
  fc.push(
    `[${last}][${i + 2}:v]overlay=0:${H}:enable='between(t,${c.start.toFixed(2)},${end.toFixed(2)})':shortest=1[v${i + 2}]`,
  );
  last = `v${i + 2}`;
});
// The narration is mixed into one wav on its own. Mixing it inside the video graph above gave an audio
// stream whose timestamps spanned 14 s for 150 s of samples (played back 10x too fast, then silence).
const vin = [];
const vfc = [];
timeline.forEach((c, i) => {
  vin.push("-i", `${D}/voice/${c.id}.wav`);
  const ms = Math.round(c.start * 1000);
  vfc.push(`[${i}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`);
});
vfc.push(`${timeline.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timeline.length}:normalize=0[aout]`);
const narration = `${TMP}/narration.wav`;
ff([...vin, "-filter_complex", vfc.join(";"), "-map", "[aout]", "-ar", "48000", narration]);
const spoken = Math.max(...timeline.map((c) => c.start + LEN[c.id]));
const narrLen = dur(narration);
if (Math.abs(narrLen - spoken) > 0.5) throw new Error(`narration.wav is ${narrLen}s, expected ${spoken}s`);

const video = `${TMP}/video.mp4`;
ff([
  ...inputs,
  "-filter_complex",
  fc.join(";"),
  "-map",
  `[${last}]`,
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "17",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  "-t",
  total.toFixed(2),
  video,
]);
// Mux: the narration is padded with silence to the length of the video.
ff([
  "-i",
  video,
  "-i",
  narration,
  "-af",
  "apad",
  "-shortest",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  OUT,
]);
const streamLen = (f, kind) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      kind,
      "-show_entries",
      "stream=duration",
      "-of",
      "csv=p=0",
      f,
    ]),
  );
const vLen = streamLen(OUT, "v");
const aLen = streamLen(OUT, "a");
if (Math.abs(vLen - aLen) > 1) throw new Error(`audio stream is ${aLen}s but video is ${vLen}s`);
console.log(JSON.stringify(timeline.map((c) => [c.id, c.start.toFixed(1), LEN[c.id].toFixed(1)])));
console.log("done", OUT, vLen.toFixed(1), "s video,", aLen.toFixed(1), "s audio");
