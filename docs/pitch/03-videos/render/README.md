# 提出用の動画を作る手順（2026-10-08）

技術デモ（約 72 秒）とピッチ（約 116 秒、`pitch2/`）の 2 本を、どちらも 1920×1080・H.264 で作る。語りは Kokoro（無料で手元で動く音声合成）の英語音声で、台本を読ませている。収録に人は要らない。

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

## ピッチ v2（2026-10-08 午後、提出版）

上のスライド式は差し替え、`pitch2/` の動く版を提出した。Apple の製品動画を手本に、明るい背景と大きな文字、本番の画面（worker の電話画面、エージェント側のカード、開発者ページ、地図）を動かす 13 場面、115 秒。

```bash
cd docs/pitch/03-videos/render/pitch2
node shots.mjs                      # 本番から画面を assets/ に撮る（終わりに表示される crop と logo のコピーも行う）
mkdir -p voice && i=0; while IFS= read -r l; do i=$((i+1)); ../tts/.venv/bin/python ../tts/say.py af_heart voice/cue$i.wav "$l" 0.95; done < narration.txt
curl -L -o music.mp3 "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3"
node render.mjs --preview preview.mp4           # 2fps の下見。配置の確認に使う
node render.mjs ~/Desktop/ProofMarket-pitch-v2.mp4 music.mp3
```

仕組み: `scene.html` は場面ごとの要素を Web Animations API で作り、全部を一時停止したまま `seek(t)` で時刻を指す。`render.mjs` が 1/30 秒ずつ `seek` して PNG を撮り、パイプで ffmpeg に流す（コマ落ちがなく、字もにじまない。M2 で 1 コマ 0.08 秒ほど）。語りの長さから場面の開始時刻を決めるので、声を差し替えても `render.mjs` を回し直すだけでよい。音楽は Kevin MacLeod「Inspired」（CC BY 4.0）。YouTube の説明文にクレジットを書く。

はまりどころ: 退場のアニメーションに `fill: both` を使うと、開始前にも最初のキーフレーム（不透明）が効いて、入場より優先される。退場は `fill: forwards` にする。

### v3（2026-10-08 夕）: 役割の対比を軸に組み直し

オーナーの指摘（エージェントと人の長所・短所の対比を前面に。17 種類の見せ方は視野が狭い。灰色の「photo_0231.jpg」の枠が壊れた画像に見える）を受けて、同じ `pitch2/` の仕組みのまま台本と 14 場面を書き換えた。約 117 秒。

- 冒頭 4 場面が「百万ページを読める／体がない／人は逆／足し合わせる」。本編のあとに「17 種類 → 現実世界の事実ぜんぶ」「既に数十億ドルの市場、エージェントで 1,000 倍（作業仮説と注記）」の 2 場面を足した。事業規模の整理は `docs/pitch/06-business-scale.md`
- 仮の写真の枠はやめ、実物の写真 `assets/shutter.jpg` を使う。出所は Wikimedia Commons「本日休ませて頂きます (11512624976).jpg」（Rumi Yoshizawa、CC BY 2.0）。`shots.mjs` は撮らないので、`curl` で取って `sips -Z 1600` で縮めて置く。動画内とYouTube の説明文にクレジットを書く
- 語りは Kokoro `af_heart`、速度 1.0（0.95 だと 125 秒で 2 分を超えた）。`render.mjs` の行間 `GAP` は 0.4 秒、末尾 `TAIL` は 2 秒
- 市場規模の数字は Straits Research と Fortune Business Insights の 2025 年推計（ともに 23 億ドル台）。「1,000 倍」は測った数ではないので、画面の脚注で作業仮説だと断っている

## 置き場所と公開

できた mp4 はリポジトリに置かず、YouTube に限定公開で上げて提出フォームに URL を書く。表題スライドと説明文に「語りは合成音声」と明記する。自分の声で録ったものに差し替えるときは、`cue*.wav` を置き換えるだけでよい。

## トップの「30 秒でわかる」の語り（2026-10-08、13 §7）

字幕の文は `apps/web/public/audio/explainer-{ja,en}.json` の `lines[].text` が正本。文を直したら、次で mp3 と各文の開始秒を作り直す（どちらも同じ JSON に書き戻す）。合計が 30 秒を超えると止まる。

```bash
cd docs/pitch/03-videos/render/tts
uv pip install --python .venv/bin/python "misaki[ja]"   # 日本語だけ。pyopenjtalk をソースからビルドするので数分〜数十分
../tts/.venv/bin/python ../explainer/make.py en af_heart 0.95
../tts/.venv/bin/python ../explainer/make.py ja jf_alpha
```

日本語は misaki の `JAG2P(version="pyopenjtalk")` で読みを発音記号にしてから Kokoro に渡す。既定の cutlet 版は 770MB の unidic 辞書を要求するので使わない。pyopenjtalk 版の戻り値は「発音記号＋同じ長さの高低記号」がつながった文字列なので、前半だけを渡す。「AI」は「エーアイ」と読ませ、字幕は AI のまま。`jf_nezumi` は 30 秒を超えたので `jf_alpha` にした。
