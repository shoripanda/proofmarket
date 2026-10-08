import sys, os, soundfile as sf
import espeakng_loader
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig
data = "/opt/homebrew/share/espeak-ng-data"; lib = "/opt/homebrew/lib/libespeak-ng.dylib"
import pathlib; H = pathlib.Path(__file__).resolve().parent
k = Kokoro(str(H/"kokoro-v1.0.onnx"), str(H/"voices-v1.0.bin"), espeak_config=EspeakConfig(lib_path=lib, data_path=data))
voice = sys.argv[1]; out = sys.argv[2]
text = open(sys.argv[3]).read().strip() if sys.argv[3].endswith('.txt') else sys.argv[3]
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
sf.write(out, samples, sr)
print(out, round(len(samples)/sr, 2), "s")
