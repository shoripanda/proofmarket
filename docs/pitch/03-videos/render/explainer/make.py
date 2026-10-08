"""Narration for the home page's "30 秒でわかる" (13 §7).

Reads apps/web/public/audio/explainer-<lang>.json (the six caption lines), speaks each line with Kokoro, joins
them with a short pause, writes explainer-<lang>.mp3 next to it and rewrites the JSON with each line's start
second, the total duration and the audio path. Captions and audio therefore always come from the same text.

  ../tts/.venv/bin/python make.py en af_heart
  ../tts/.venv/bin/python make.py ja jf_alpha      # needs `misaki[ja]` in the same venv (pyopenjtalk fetches a 22MB dictionary once)

Run it from docs/pitch/03-videos/render/tts (Kokoro's model files live there; see ../README.md).
"""
import json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig

GAP_S = 0.8   # silence between scenes
LIMIT_S = 30.0  # 13 §7: the whole tour fits in 30 seconds

lang, voice = sys.argv[1], sys.argv[2]
speed = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../apps/web/public/audio"))
meta_path = os.path.join(root, f"explainer-{lang}.json")
meta = json.load(open(meta_path))

k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin", espeak_config=EspeakConfig(
    lib_path="/opt/homebrew/lib/libespeak-ng.dylib", data_path="/opt/homebrew/share/espeak-ng-data"))

if lang == "ja":
    from misaki import ja as misaki_ja
    g2p = misaki_ja.JAG2P(version="pyopenjtalk")  # the default (cutlet) needs the 770MB unidic dictionary
    # Read "AI" as the word people say ("エーアイ"); the caption keeps the letters.
    def say(text):
        both, _ = g2p(text.replace("AI", "エーアイ"))
        # the pyopenjtalk path returns the phonemes and an equally long pitch string glued together
        ph = both[: len(both) // 2]
        return k.create(ph, voice=voice, speed=speed, is_phonemes=True)
else:
    def say(text):
        return k.create(text, voice=voice, speed=speed, lang="en-us")

chunks, t, sr = [], 0.0, 24000
for line in meta["lines"]:
    samples, sr = say(line["text"])
    line["start"] = round(t, 2)
    chunks.append(samples)
    chunks.append(np.zeros(int(GAP_S * sr), dtype=samples.dtype))
    t += len(samples) / sr + GAP_S
audio = np.concatenate(chunks[:-1])
total = round(len(audio) / sr, 2)
if total > LIMIT_S:
    sys.exit(f"{total}s is over {LIMIT_S}s: shorten the lines or raise the speed")

with tempfile.TemporaryDirectory() as d:
    wav = os.path.join(d, "a.wav")
    sf.write(wav, audio, sr)
    mp3 = os.path.join(root, f"explainer-{lang}.mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "48k", mp3], check=True)

meta["audio"] = f"/audio/explainer-{lang}.mp3"
meta["duration"] = total
json.dump(meta, open(meta_path, "w"), ensure_ascii=False, indent=2)
open(meta_path, "a").write("\n")
print(lang, voice, total, "s", [l["start"] for l in meta["lines"]])
