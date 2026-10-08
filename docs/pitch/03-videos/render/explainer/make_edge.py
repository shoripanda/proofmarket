"""Narration for the home page's "30 秒でわかる" with a neural voice (13 §7, 2026-10-09).

Same contract as make.py (reads apps/web/public/audio/explainer-<lang>.json, writes the mp3 next to it and the
start second of every line back into the JSON), but the voice is Microsoft's neural TTS reached through the
edge-tts package instead of Kokoro, because the Kokoro Japanese voices sound mechanical. edge-tts needs the
network and no key. Its terms of use are not a formal API licence; if that becomes a problem, VOICEVOX (free,
licensed for commercial use with credit) is the local alternative.

  uv venv tts-venv && uv pip install --python tts-venv/bin/python edge-tts
  tts-venv/bin/python make_edge.py ja ja-JP-NanamiNeural
  tts-venv/bin/python make_edge.py en en-US-AvaNeural

Voices worth trying: ja-JP-NanamiNeural (female), ja-JP-KeitaNeural (male); en-US-AvaNeural, en-US-AndrewNeural.
"""
import asyncio, json, os, subprocess, sys, tempfile

import edge_tts

GAP_S = 0.7   # silence between scenes
LIMIT_S = 30.0  # 13 §7: the whole tour fits in 30 seconds

lang, voice = sys.argv[1], sys.argv[2]
rate = sys.argv[3] if len(sys.argv) > 3 else "+0%"   # e.g. "-5%" to slow down
root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../apps/web/public/audio"))
meta_path = os.path.join(root, f"explainer-{lang}.json")
meta = json.load(open(meta_path))


def spoken(text: str) -> str:
    # Read "AI" as people say it; the caption keeps the letters.
    return text.replace("AI", "エーアイ") if lang == "ja" else text


def seconds(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return float(out)


async def main():
    with tempfile.TemporaryDirectory() as d:
        parts, t = [], 0.0
        for i, line in enumerate(meta["lines"]):
            mp3 = os.path.join(d, f"{i}.mp3")
            await edge_tts.Communicate(spoken(line["text"]), voice, rate=rate).save(mp3)
            wav = os.path.join(d, f"{i}.wav")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "24000", "-ac", "1", wav], check=True)
            line["start"] = round(t, 2)
            t += seconds(wav) + GAP_S
            parts.append(wav)
        total = round(t - GAP_S, 2)
        if total > LIMIT_S:
            sys.exit(f"{total}s is over {LIMIT_S}s: shorten the lines or pass a faster rate")
        # concat with the gaps: n inputs and n-1 generated silences, "[0:a][s0][1:a][s1]...concat"
        inputs = [a for w in parts for a in ("-i", w)]
        chain = "".join(
            f"[{i}:a]" + (f"[s{i}]" if i < len(parts) - 1 else "") for i in range(len(parts))
        )
        sil = ";".join(f"aevalsrc=0:d={GAP_S}:s=24000:c=mono[s{i}]" for i in range(len(parts) - 1))
        filt = f"{sil};{chain}concat=n={2*len(parts)-1}:v=0:a=1[out]"
        out = os.path.join(root, f"explainer-{lang}.mp3")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", filt, "-map", "[out]", "-b:a", "48k", out],
            check=True,
        )
        meta["audio"] = f"/audio/explainer-{lang}.mp3"
        meta["duration"] = round(seconds(out), 2)
        json.dump(meta, open(meta_path, "w"), ensure_ascii=False, indent=2)
        open(meta_path, "a").write("\n")
        print(lang, voice, meta["duration"], "s", [l["start"] for l in meta["lines"]])


asyncio.run(main())
