# How the submission videos are made (2026-10-08)

Two videos — a technical demo (about 72 s) and a pitch (about 116 s, `pitch2/`) — both 1920×1080 H.264. The narration is Kokoro (free speech synthesis that runs locally) reading the script in an English voice. No one needs to be recorded.

## Setup (once)

```bash
brew install espeak-ng                       # Kokoro's pronunciation dictionary. The pip espeak cannot read its data on macOS
cd docs/pitch/03-videos/render/tts
uv venv -p 3.12 .venv && uv pip install --python .venv/bin/python kokoro-onnx soundfile
curl -L -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Synthesize one line at a time with `tts/say.py <voice> <out.wav> <text|file.txt> [speed]`. Voices tried: `af_heart` (female) and `am_michael` (male). `.venv` and the models (about 350 MB) are not committed.

## Technical demo

Record the autoplay of `/en/try` and overlay title and closing cards, narration and captions.

1. Start `pnpm dev:local` (http://localhost:3917)
2. `node demo/build.mjs af_heart ~/Desktop/ProofMarket-demo-en.mp4`

What it does: synthesize `demo/narration.txt` line by line → record `/en/try` at 1920×1080 with Playwright → turn `card.html` into still-image clips (title 3 s, closing for as long as the narration lasts) → concat → overlay each line's narration with `adelay`.

Captions are drawn inside the page as a fixed band (a `<div id="pm-sub">` is added before recording, and lines switch by watching the on-screen text). In ffmpeg 9, an image overlay applied only to the first frame and the captions disappeared, hence this approach. The same watcher decides when each narration line starts. When the screen gets ahead of the narration, the next line waits until the previous one has finished. The `MARKERS` strings correspond to the stage labels and the "attempt 2" display in `components/try-experience.tsx`.

## Technical demo v2 (2026-10-12, replacing the submitted version)

v1 recorded the `/en/try` autoplay as is, so the screen was small and you could not see what was being pressed. The caption band also overlapped the bottom edge of the phone screen. Following the owner's feedback it was rebuilt in `demo2/`. About 145 s.

- The screen is the top 1920×900 and captions sit in a 180px band below. The band is overlaid afterwards with ffmpeg, so captions never cover an action. The band also shows a stage label (such as "3 · A person acts")
- `/en/try` is switched to manual with "Stop and take over" and the script presses each button itself. Before each press a round cursor moves there, and a ripple appears where it presses. Answers are typed one character at a time instead of picked from choices
- The camera zooms onto the part in use (the agent panel, the phone, the result) with a transform on body. Demo-only notes ("In production…", the made-up URL, Play again) are hidden
- The second half shows the real thing in production. On a public result page (`/en/r/ver_01M42M6WXZ93MFR3YDQZ7JXEHG`) it actually presses "Compare with the record on Solana" and records the 5 items matching. Then it shows that request's settle transaction (`34sEPAZg…`) on Solana Explorer in three shots: Summary, Logs (FinalizeVerification and Settle) and Tokens (+0.5 USDC to the worker). Explorer scrolls inside an inner box the camera cannot follow, so these are per-element screenshots
- Narration is Kokoro `af_heart`. edge-tts returned 403 on 2026-10-12

```bash
# Narration (one line of narration.txt = "id<TAB>text"). Set up tts/ as above
cd docs/pitch/03-videos/render/demo2 && mkdir -p voice
while IFS=$'\t' read -r id text; do printf '%s' "$text" > /tmp/l.txt; ../tts/.venv/bin/python ../tts/say.py af_heart voice/$id.wav /tmp/l.txt 1.0; done < narration.txt
# Record and assemble (uses production https://proofmarket.fun; override with PM_BASE)
PLAYWRIGHT=$(pwd)/../../../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright node build.mjs ~/Desktop/ProofMarket-demo-v2.mp4
```

Pitfalls:
- Searching by text hits explanatory copy such as "Press “I'm here”" before the button. Prefer buttons whose label starts with that text
- Hiding "the element containing that text" removed the whole outer box and left the screen white. Hide only the innermost element
- Clicking the outer div of the result page's compare button does nothing. Press it via `closest("button")`

### Technical demo v4 (evening of 2026-10-12): 4K

Playwright's recording (`recordVideo`) is fixed at VP8, about 0.7 Mbps, so small text was already blurred when recorded. YouTube's 1080p rendition drops further to 0.25–0.41 Mbps. So the recording method was changed.

- Recording uses CDP `Page.startScreencast` (lossless PNG). Unless the browser is launched with `--force-device-scale-factor=2`, frames still arrive at 1920×900. Frames only arrive when the page changes, so for every 1/30 s of output the last frame received by then is hard-linked into a numbered sequence to make 30 fps video
- The band, cards and Explorer images are also captured at 2× and composited at 3840×2160. The scale is `DEMO_SCALE` (default 2)
- Temporary files: the `/try` scene alone is about 1,100 PNGs (hundreds of MB). Check free space before rendering

### Technical demo v5 (2026-10-13): zoom in for every action

Following the owner's feedback (text on the phone is cut off; show actions as close up as possible), the camera works differently.

- The "Worker's phone" label above the phone was cut in half at the top of the frame, so it is hidden
- For each action, `x.focus([...])` zooms onto just the card in use (a direct child of the phone's scroll container) and the button. The phone is scrolled first so the whole zoom area fits on screen. Long smooth scrolls do not finish within 450 ms, so wait until `scrollTop` stops before measuring
- Outside the zoomed area a light veil (a large box-shadow) hides everything. Moving the veil by position and size repainted the whole 4K frame every frame and recording fell from 24 to 15 frames/s. So the order is "hide → move → show once the camera stops", and only opacity is animated
- Right after "Submit" is pressed, the camera pulls back to the whole phone while the screen switches to the verdict, then zooms onto the verdict card. Waiting while still zoomed in showed the half-switched screen inside the frame
- Frames are written asynchronously after the ack. Writing synchronously delays the ack and Chrome stops sending frames

## Pitch

Each line of `pitch/narration.txt` becomes one slide (`pitch/slide.html?k=N`).

```bash
cd docs/pitch/03-videos/render/tts
mkdir -p ../pitch/voice && i=0; while IFS= read -r l; do i=$((i+1)); .venv/bin/python say.py af_heart ../pitch/voice/cue$i.wav "$l"; done < ../pitch/narration.txt
node ../pitch/build.mjs ../pitch/voice ~/Desktop/ProofMarket-pitch-en.mp4
```

Slides are captured with Playwright, each turned into a clip with `ffmpeg -loop 1` (CRF 17, 30 fps, 0.7 s of silence at the end), then concatenated. The submission rules cap the pitch at 2 minutes, so watch the total seconds `build.mjs` prints.

## Pitch v2 (afternoon of 2026-10-08, the submitted version)

The slide approach above was replaced; the animated version in `pitch2/` was submitted. Modelled on Apple's product videos: a light background, large type, and 13 scenes animating real production screens (the worker's phone, the agent-side card, the developer page, the map), 115 s.

```bash
cd docs/pitch/03-videos/render/pitch2
node shots.mjs                      # capture screens from production into assets/ (also does the crop and logo copy shown at the end)
mkdir -p voice && i=0; while IFS= read -r l; do i=$((i+1)); ../tts/.venv/bin/python ../tts/say.py af_heart voice/cue$i.wav "$l" 0.95; done < narration.txt
curl -L -o music.mp3 "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3"
node render.mjs --preview preview.mp4           # 2 fps preview for checking layout
node render.mjs ~/Desktop/ProofMarket-pitch-v2.mp4 music.mp3
```

How it works: `scene.html` builds each scene's elements with the Web Animations API, keeps them all paused, and points at a time with `seek(t)`. `render.mjs` seeks in 1/30 s steps, captures PNGs and pipes them into ffmpeg (no dropped frames, no blurry text; about 0.08 s per frame on an M2). Scene start times are derived from the narration lengths, so swapping the voice only needs `render.mjs` rerun. Music: Kevin MacLeod, "Inspired" (CC BY 4.0); credited in the YouTube description.

Pitfall: using `fill: both` on exit animations makes the first keyframe (opaque) apply before they start, overriding the entrance. Use `fill: forwards` for exits.

### v3 (evening of 2026-10-08): rebuilt around contrasting roles

Following the owner's feedback (put the contrast between agents' and people's strengths and weaknesses up front; showing 17 types is too narrow; the grey "photo_0231.jpg" frame looks like a broken image), the script and 14 scenes were rewritten on the same `pitch2/` machinery. About 117 s.

- The first 4 scenes are "can read a million pages / has no body / people are the opposite / add them together". After the main part, two scenes were added: "17 types → every real-world fact" and "already a multi-billion-dollar market, 1,000× with agents (a working hypothesis, with a footnote)". The business-scale reasoning is in `docs/pitch/06-business-scale.md`
- The placeholder photo frame was replaced with a real photo, `assets/shutter.jpg`, from Wikimedia Commons (a sign reading "Closed today", Flickr photo 11512624976) by Rumi Yoshizawa, CC BY 2.0. `shots.mjs` does not capture it; fetch it with `curl` and shrink with `sips -Z 1600`. Credit it in the video and in the YouTube description
- Narration is Kokoro `af_heart` at speed 1.0 (0.95 ran 125 s, over 2 minutes). In `render.mjs`, the gap between lines `GAP` is 0.4 s and the tail `TAIL` is 2 s
- The market-size figures are 2025 estimates from Straits Research and Fortune Business Insights (both around $2.3 billion). "1,000×" is not measured, so an on-screen footnote says it is a working hypothesis

### v4 (2026-10-12): the product as subject, following the submission form's questions

Following the owner's instructions (leave out the founder and put the product first; include what the Colosseum form asks for; no caveats like "Tokyo only" or "trial stage"; why build it in Japan is fine to say), the script and 15 scenes were rewritten on the same `pitch2/` machinery. 104.9 s.

- The founder scene was removed; instead, one scene per form question. Who it is for (claude.ai, ChatGPT, Claude Code, Codex CLI, your own code), why now (tool calls and payments exist, but there was no trustworthy path into the real world), revenue (bounty per person × people + fee), and how Solana is used plus the stack (Anchor, Next.js, Supabase, Privy, MCP+OAuth 2.1, Claude, x402 v2, program ID)
- The "Proof anyone can check" scene is the real proof page in production. `shots2.mjs` presses "Compare with the record on Solana" on a public result page and captures the 5-of-5 match box and the "Verified by a person" box. It also captures "Connecting from each AI" on the developer page; the Claude Code column is cut out with `crop=980:1000:420:1000`
- "What works today" is not narrated, only shown as on-screen pills (17 types, 8 MCP tools, watches, public map, open dataset, Solana Pay top-ups). The word "Devnet" stays only in the footnote of the proof scene
- The ending drops "In Tokyo? Join as a worker" for "join as a worker from your phone"

```bash
cd docs/pitch/03-videos/render/pitch2
node shots.mjs && node shots2.mjs        # production screens. agent-request is crop=1240:1200:0:1100
ffmpeg -i assets/dev-clients.png -vf crop=980:1000:420:1000 assets/dev-clients-col.png
# Narration (af_heart, speed 1.0) → 2 fps preview → final render. Same steps as v2
```

v5 (same night): following the owner's feedback (screens and words are cut off; it moves on before you can read everything), two changes. 128.9 s.

- Every screen is shown whole. The developer page's first row of "Connecting from each AI" (heading and two cards) is cut out with `crop=2080:825:400:1000` and fitted into a 1600-wide frame. The request card is cut with `crop=1240:1200:0:990`, from "Asking someone on the spot" to "Bounty escrowed", fitted into 720 wide without scrolling. Phone screens whose bottom card is cut off (Task details) are not used
- Scene length is set by content, not narration. `scene.html` records when `show()`, `phone()` and `counter()` elements appear in each scene (`window.sceneEnds()`). `render.mjs` reads that in a first `setup`, then rebuilds the timetable as "narration done and the last element in, then hold 1 s (`HOLD`), then a 0.45 s crossfade" and renders with a second `setup`

v6 (same night): image quality and phone size. YouTube re-encodes 1080p video down to about 0.5 Mbps, so small text in screenshots blurred. Uploading in 4K makes YouTube re-encode at a higher bitrate, so text holds up even when watched at 1080p.

- `render.mjs` keeps the 1920×1080 layout but draws with `deviceScaleFactor: 2` and outputs 3840×2160 (`RENDER_SCALE`; previews use 1×). x264 preset `medium`. Rendering takes about 18 minutes
- Assets are captured at 4× with `SHOT_SCALE=4 node shots.mjs && SHOT_SCALE=4 node shots2.mjs`. Crops double too (request card `crop=2480:2400:0:1980`, developer page `crop=4160:1650:800:2000`)
- At 4× each capture is slower and drifts against the `/try` autoplay, shifting the numbering. After recapturing, lay out the phone screens and pick the numbers again (this time 03, 08, 10, 12, 18)
- The phone is 577×1000 (the full frame height) on the right half. The program ID line at the bottom of "Why Solana" was removed

Pitfalls: Wikimedia Commons `Special:FilePath` fails with a raw Japanese file name, so URL-encode it and put contact details in the User-Agent. The Kokoro model (about 340 MB) is excluded by `tts/.gitignore`; if missing, fetch it again with the curl at the top of this README (can take 15 minutes on a slow line).

## Where the files go, and publishing

The resulting mp4 files are not committed. Upload them to YouTube as unlisted and put the URLs in the submission form. State "narration is synthesized" on the title slide and in the description. To replace it with a recording of your own voice, just replace the `cue*.wav` files.

## Narration for the home page's "Understand it in 30 seconds" (2026-10-08, 13 §7)

The caption text's source of truth is `lines[].text` in `apps/web/public/audio/explainer-{ja,en}.json`. After editing the text, regenerate the mp3 and each line's start second with the commands below (both are written back to the same JSON). It stops if the total exceeds 30 seconds.

```bash
cd docs/pitch/03-videos/render/tts
uv pip install --python .venv/bin/python "misaki[ja]"   # Japanese only. Builds pyopenjtalk from source: minutes to tens of minutes
# From 2026-10-09 production narration uses neural voices (edge-tts), after feedback that Kokoro's Japanese sounded mechanical
uv venv tts-venv && uv pip install --python tts-venv/bin/python edge-tts
tts-venv/bin/python ../explainer/make_edge.py ja ja-JP-NanamiNeural   # 29.5 s
tts-venv/bin/python ../explainer/make_edge.py en en-US-AvaNeural      # 22.7 s
# The older Kokoro procedure (no key, no network)
../tts/.venv/bin/python ../explainer/make.py en af_heart 0.95
../tts/.venv/bin/python ../explainer/make.py ja jf_alpha
```

edge-tts is an unofficial package that uses Microsoft Edge's read-aloud over the network. It needs no key, but its terms are not a formal API contract. If that becomes a problem, switch to VOICEVOX (free, commercial use allowed, with credit). For Japanese, Kokoro takes phonemes produced by misaki's `JAG2P(version="pyopenjtalk")`. The default cutlet version requires a 770 MB unidic dictionary, so it is not used. The pyopenjtalk version returns "phonemes + pitch marks of the same length" joined in one string, so only the first half is passed. "AI" is read as the Japanese pronunciation "ē-ai" while captions keep the letters AI. `jf_nezumi` ran over 30 seconds, so `jf_alpha` was chosen.
