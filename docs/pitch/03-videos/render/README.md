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
