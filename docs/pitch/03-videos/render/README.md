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

## 技術デモ v2（2026-10-12、提出版の差し替え）

v1 は `/en/try` の自動再生をそのまま撮ったので、画面が小さく、どこを押したのかも見えなかった。字幕の帯も電話の画面の下端に重なっていた。オーナーの指摘を受けて `demo2/` で作り直した。約 145 秒。

- 画面は上の 1920×900、字幕は下の 180px の帯に分けた。帯は ffmpeg で後から重ねるので、操作の上に字幕が載ることはない。帯には段階の札（「3 · A person acts」など）も出す
- `/en/try` は「Stop and take over」で手動にし、スクリプトが 1 回ずつ押す。押す前に丸いカーソルを動かし、押した所に波紋を出す。答えは選択肢ではなく、文字を 1 字ずつ打ち込む
- カメラは body の transform で、いま使っている部分（エージェントの欄、電話、結果）へ寄る。デモ用の注記（「In production…」、架空の URL、Play again）は隠す
- 後半は本番の実物を見せる。公開の結果ページ（`/en/r/ver_01M42M6WXZ93MFR3YDQZ7JXEHG`）で「Compare with the record on Solana」を実際に押し、5 項目が match になるところを撮る。続けて、その依頼の settle の取引（`34sEPAZg…`）を Solana Explorer の Summary・Logs（FinalizeVerification と Settle）・Tokens（作業者に +0.5 USDC）の 3 枚で見せる。Explorer は中の箱でスクロールするのでカメラで追えず、要素ごとのスクリーンショットにした
- 語りは Kokoro `af_heart`。edge-tts は 2026-10-12 に 403 で使えなかった

```bash
# 語り（narration.txt の 1 行 = 「id<TAB>文」）。tts/ の準備は上と同じ
cd docs/pitch/03-videos/render/demo2 && mkdir -p voice
while IFS=$'\t' read -r id text; do printf '%s' "$text" > /tmp/l.txt; ../tts/.venv/bin/python ../tts/say.py af_heart voice/$id.wav /tmp/l.txt 1.0; done < narration.txt
# 録画と組み立て（本番 https://proofmarket.fun を使う。PM_BASE で差し替え可）
PLAYWRIGHT=$(pwd)/../../../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright node build.mjs ~/Desktop/ProofMarket-demo-v2.mp4
```

はまりどころ:
- 文字で探すと、ボタンより先に「“I'm here” を押してください」のような説明文が当たる。ラベルがその文字で始まるボタンを優先する
- 隠す対象を「その文字を含む要素」にすると、外側の箱ごと消えて画面が真っ白になった。いちばん内側の要素だけを隠す
- 結果ページの照合ボタンは、外側の div を click しても動かない。`closest("button")` で押す

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

### v4（2026-10-12）: 製品が主語、提出フォームの設問に沿う

オーナーの指示（自分のことは書かず製品のことを先に。Colosseum のフォームに書いた必要事項を載せる。東京だけ・試行段階といった断りは入れない。日本で作る意味は書いてよい）を受けて、同じ `pitch2/` の仕組みのまま台本と 15 場面を書き直した。104.9 秒。

- 創業者の場面を外し、代わりにフォームの設問に 1 場面ずつ当てた。誰のためか（claude.ai・ChatGPT・Claude Code・Codex CLI・自前のコード）、なぜ今か（道具呼び出しと支払いは揃ったが、現実世界へ届く信用できる経路が無かった）、収益（1 人あたりの報酬 × 人数 ＋ 手数料）、Solana の使い方と技術の積み（Anchor・Next.js・Supabase・Privy・MCP+OAuth 2.1・Claude・x402 v2、プログラム ID）
- 「Proof anyone can check」の場面は本番の証明ページの実物。`shots2.mjs` が公開結果ページで「Compare with the record on Solana」を押し、5 項目 match の箱と「Verified by a person」の箱を撮る。開発者ページの「Connecting from each AI」も撮り、Claude Code の列を `crop=980:1000:420:1000` で切り出して使う
- 「今日動いているもの」は語らず画面の札だけで出す（17 種類・MCP 8 道具・見守り・公開地図・公開データセット・Solana Pay の入金）。「Devnet」の文字は証明の場面の脚注にだけ残した
- 結びは「In Tokyo? Join as a worker」をやめ、「join as a worker from your phone」にした

```bash
cd docs/pitch/03-videos/render/pitch2
node shots.mjs && node shots2.mjs        # 本番の画面。agent-request は crop=1240:1200:0:1100
ffmpeg -i assets/dev-clients.png -vf crop=980:1000:420:1000 assets/dev-clients-col.png
# 語り（af_heart、速度 1.0）→ 2fps の下見 → 本番描画。手順は v2 と同じ
```

v5（同日夜）: オーナーの指摘（画面や言葉が見切れる。内容を読み切る前に次へ移る）を受けて 2 点を変えた。128.9 秒。

- 画面はすべて丸ごと見せる。開発者ページは「Connecting from each AI」の 1 行目（見出しと 2 枚のカード）を `crop=2080:825:400:1000` で切り出して幅 1600 の枠に収め、依頼カードは `crop=1240:1200:0:990` で「Asking someone on the spot」から「Bounty escrowed」までを 720 幅に収めてスクロールしない。電話は下端でカードが切れる画面（Task details）を使わない
- 場面の長さは語りではなく内容で決める。`scene.html` が `show()`・`phone()`・`counter()` の出現時刻を場面ごとに記録し（`window.sceneEnds()`）、`render.mjs` が 1 回目の `setup` でそれを読んでから、「語りが終わり、最後の要素が出そろってから 1 秒（`HOLD`）置いて、0.45 秒でクロスフェード」の時間割を組み直して 2 回目の `setup` で描く

v6（同日夜）: 画質と電話の大きさ。YouTube は 1080p の動画を 0.5 Mbps ほどまで圧縮し直すので、画面写真の小さな字がにじんでいた。4K で上げると YouTube は高いビットレートで圧縮し直すため、1080p で見ても字が保たれる。

- `render.mjs` は配置を 1920×1080 のまま `deviceScaleFactor: 2` で描き、3840×2160 で出す（`RENDER_SCALE`、下見は 1 倍）。x264 は `medium`。描画は約 18 分
- 素材は `SHOT_SCALE=4 node shots.mjs && SHOT_SCALE=4 node shots2.mjs` で 4 倍に撮る。切り出しも 2 倍にずれる（依頼カード `crop=2480:2400:0:1980`、開発者ページ `crop=4160:1650:800:2000`）
- 4 倍で撮ると 1 枚ごとの撮影が遅くなり、`/try` の自動再生とのずれで番号がずれる。撮り直したら電話の画面を並べて番号を選び直す（今回は 03・08・10・12・18）
- 電話は 577×1000（画面の高さいっぱい）にして右半分に置いた。「Why Solana」の下端にあったプログラム ID の行は外した

はまりどころ: Wikimedia Commons の `Special:FilePath` は日本語のファイル名をそのまま渡すと落ちるので URL 符号化し、User-Agent に連絡先を入れる。Kokoro のモデル（約 340MB）は `tts/.gitignore` で除外してあり、無ければ README 冒頭の curl で取り直す（回線によっては 15 分かかる）。

## 置き場所と公開

できた mp4 はリポジトリに置かず、YouTube に限定公開で上げて提出フォームに URL を書く。表題スライドと説明文に「語りは合成音声」と明記する。自分の声で録ったものに差し替えるときは、`cue*.wav` を置き換えるだけでよい。

## トップの「30 秒でわかる」の語り（2026-10-08、13 §7）

字幕の文は `apps/web/public/audio/explainer-{ja,en}.json` の `lines[].text` が正本。文を直したら、次で mp3 と各文の開始秒を作り直す（どちらも同じ JSON に書き戻す）。合計が 30 秒を超えると止まる。

```bash
cd docs/pitch/03-videos/render/tts
uv pip install --python .venv/bin/python "misaki[ja]"   # 日本語だけ。pyopenjtalk をソースからビルドするので数分〜数十分
# 2026-10-09 から本番の語りは neural 音声（edge-tts）。Kokoro の日本語は機械的だと指摘されたため
uv venv tts-venv && uv pip install --python tts-venv/bin/python edge-tts
tts-venv/bin/python ../explainer/make_edge.py ja ja-JP-NanamiNeural   # 29.5 秒
tts-venv/bin/python ../explainer/make_edge.py en en-US-AvaNeural      # 22.7 秒
# Kokoro で作る旧手順（鍵も網も要らない）
../tts/.venv/bin/python ../explainer/make.py en af_heart 0.95
../tts/.venv/bin/python ../explainer/make.py ja jf_alpha
```

edge-tts は Microsoft Edge の読み上げを網経由で使う非公式のパッケージで、鍵は要らないが利用規約は正式な API 契約ではない。問題になれば VOICEVOX（無料・商用可・クレジット表記）に替える。日本語の Kokoro は misaki の `JAG2P(version="pyopenjtalk")` で読みを発音記号にしてから Kokoro に渡す。既定の cutlet 版は 770MB の unidic 辞書を要求するので使わない。pyopenjtalk 版の戻り値は「発音記号＋同じ長さの高低記号」がつながった文字列なので、前半だけを渡す。「AI」は「エーアイ」と読ませ、字幕は AI のまま。`jf_nezumi` は 30 秒を超えたので `jf_alpha` にした。
