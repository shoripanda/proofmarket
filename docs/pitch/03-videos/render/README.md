# 提出用の動画を作る手順（2026-10-08）

技術デモ（約 65 秒）とピッチ（約 110 秒）の 2 本を、どちらも 1920×1080・H.264 で作る。語りは Kokoro（無料で手元で動く音声合成）の英語音声で、台本を読ませている。収録に人は要らない。

## 準備（最初の 1 回だけ）

```bash
brew install espeak-ng                       # Kokoro の発音辞書。pip 版の espeak は macOS でデータを読めない
cd docs/pitch/03-videos/render/tts
uv venv -p 3.12 .venv && uv pip install --python .venv/bin/python kokoro-onnx soundfile
curl -L -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

`tts/say.py <voice> <out.wav> <text|file.txt> [speed]` で 1 行ずつ合成する。声は `af_heart`（女性）と `am_michael`（男性）を試した。`.venv` とモデル（約 350MB）はリポジトリに入れない。

## 技術デモ

`/en/try` の自動再生を録画し、表題と結びのカード、語り、字幕を重ねる。

1. `pnpm dev:local`（http://localhost:3917）を起動する
2. `node demo/build.mjs af_heart ~/Desktop/ProofMarket-demo-en.mp4`

中で行うこと: `demo/narration.txt` を 1 行ずつ合成 → Playwright で `/en/try` を 1920×1080 で録画 → `card.html` を表題 3 秒・結びは語りが終わるまでの長さで静止画の動画に → concat → 各行の語りを `adelay` で重ねる。

字幕はページの中に固定の帯として描く（録画の前に `<div id="pm-sub">` を足し、画面の文言を見張って行を切り替える）。ffmpeg 9 では画像の overlay が 1 コマ目にしか効かず、字幕が消えたので、この方式にした。語りの開始時刻も同じ見張りで決める。画面が語りより先に進んだときは、前の行を言い終えるまで次の行を待たせる。`MARKERS` の文言は `components/try-experience.tsx` の段階ラベルと「attempt 2」の表示に対応している。

## ピッチ

`pitch/narration.txt` の 1 行が 1 枚のスライド（`pitch/slide.html?k=N`）になる。

```bash
cd docs/pitch/03-videos/render/tts
mkdir -p ../pitch/voice && i=0; while IFS= read -r l; do i=$((i+1)); .venv/bin/python say.py af_heart ../pitch/voice/cue$i.wav "$l"; done < ../pitch/narration.txt
node ../pitch/build.mjs ../pitch/voice ~/Desktop/ProofMarket-pitch-en.mp4
```

スライドを Playwright で撮り、1 枚ごとに `ffmpeg -loop 1`（CRF 17・30fps・末尾 0.7 秒の無音）で動画にして concat する。ピッチは 2 分以内という提出条件があるので、`build.mjs` が出す合計秒数を見る。

## 置き場所と公開

できた mp4 はリポジトリに置かず、YouTube に限定公開で上げて提出フォームに URL を書く。表題スライドと説明文に「語りは合成音声」と明記する。自分の声で録ったものに差し替えるときは、`cue*.wav` を置き換えるだけでよい。
