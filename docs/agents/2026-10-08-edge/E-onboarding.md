# Owner E: a beginner's path (design §7)

Branch: `feat/onboarding-visual`. Worktree: `~/proofmarket-e`. Touch neither the server nor the DB.

## What to build

### Site
1. **Understand it in 30 seconds** (the first section of the home page `apps/web/app/(site)/page.tsx`)
   - `apps/web/components/explainer.tsx`: show `FlowDiagram` (`flow-diagram.tsx`) large and advance its highlighting in step with narration over 6 scenes. One play button (line-art triangle). The narration is an mp3 played with `<audio>`, switching scenes on `timeupdate` (each scene's start second is kept in JSON). Captions are one line (that scene's sentence). Where sound cannot play, it advances automatically with captions only
   - Make the narration with Kokoro: follow "Setup" in `docs/pitch/03-videos/render/README.md` (the environment is in the old scratchpad `tts/`; if missing, install it per the README) and put 6 Japanese and 6 English sentences into `apps/web/public/audio/explainer-{ja,en}.mp3` (joined with `ffmpeg`, each sentence's start second in `explainer-{ja,en}.json`). Try Kokoro voices such as `jf_alpha` for Japanese; if that fails, English audio with Japanese captions only is acceptable (say so in the PR description). 30 seconds in total. The sentences follow the 6 scenes of design §7, with no jargon
2. **Plain words**: `PlainProvider`, `usePlain()` and `<Term k="solana">` in `apps/web/lib/client/plain.tsx`. Mapping (design §0): solana / usdc / escrow / mcp / x402 / api-key / wallet. When plain words are **on**, terms are replaced; off shows the original. A toggle in the header (`SiteShell` in `components/site.tsx`) labelled "plain words", stored in `localStorage` `pm.plain`, on by default. Wrap jargon in the body of the home page, /how-it-works, /workers, /join and /pricing with `<Term>` (not `/developers`, which is for developers)
3. One illustration per section of **/how-it-works** (SVG line art: a camera, a row of checks, two people agreeing, a ledger), collected in `components/illustrations.tsx`. Keep only the heading and one sentence per section; fold the rest into `<details>`
4. Turn **/workers** into "3 pictures and 3 sentences": sign up (phone) → requests nearby (map pin) → shoot, answer and get paid (camera and coin). Under each picture, one sentence and a `ListenButton` (built by owner D; if absent, call `speechSynthesis` directly in 5 lines). Fold the existing detailed text below

### Worker app
5. A 3-screen first-run tour (on first display of `apps/web/app/(worker)/tasks/page.tsx`, `localStorage` `pm.tour=done`): "See requests nearby", "Shoot and answer", "Get paid". A picture (reusing the line art above), one sentence, a read-aloud button and "skip". `components/tour.tsx`
6. No jargon: add a yen estimate next to USDC amounts on worker screens (change `yen()` in `ui.tsx` to show "0.30 USDC (about 45 yen)"; the rate is a fixed 150 yen in `lib/client/rate.ts`, labelled "estimate")

### /try
7. A toggle that reads the agent's "thinking" bubbles aloud (`try-experience.tsx`; off by default; `speechSynthesis`)

## How to check
With all text hidden (`color: transparent` in dev tools), take screenshots in which the flow can still be followed, of the home page, /how-it-works, /workers and the worker tour, and put them in `docs/agents/2026-10-08-edge/e-screens/` (PNG, 390 px wide).

## Done when
In those screenshots the flow is clear from pictures and sound alone. Toggling plain words removes the jargon.
