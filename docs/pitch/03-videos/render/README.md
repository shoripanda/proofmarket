# 技術デモ動画を自動で作る手順（2026-10-07）

`/try` の自動再生を録画し、英語の語り（macOS の音声合成 Samantha）と字幕を重ねて mp4 にする。収録に人は要らない。所要 3 分。

1. 開発サーバーを起動: `pnpm dev:local`（http://localhost:3917）
2. 語りを段落ごとに合成して長さを測り、字幕（SRT）を作る: `narration.txt` を文ごとに `say -v Samantha -r 172 -o cueNN.aiff "<文>"`、`ffprobe` で長さを取り、累積時刻から SRT を組む（開始は 2.5 秒）
3. Playwright で `/try` を 1280×800・1x で録画（`recordVideo`）。「やってみる」の見出しが上端に来るようスクロールしてから、「最初からもう一度」が出るまで待つ（約 45 秒）
4. 表題と結びのカードは `card.html?k=start` / `?k=end` を同じ大きさでスクリーンショット → `ffmpeg -loop 1` で 3 秒 / 7 秒の動画に
5. 字幕は libass が無くても焼けるよう、文ごとに透明 PNG を Playwright で描き、`overlay=0:680:enable='between(t,a,b)'` を連ねる（ffmpeg 9 はフィルタ文字列をファイルから `-/filter_complex fc.txt` で読む）
6. 結合: `concat`（start → demo → end）→ 語りを `adelay=2500` で重ねて `-shortest`

できたもの: `ProofMarket-demo-en.mp4`（61 秒、約 3.4 MB、1280×800、H.264 + AAC）。リポジトリには置かず、YouTube に限定公開で上げて提出フォームに URL を書く。

語りを変えるときは `narration.txt` を直して 2 からやり直す。画面の間を変えるときは `apps/web/components/try-experience.tsx` の自動再生の待ち時間（ミリ秒）を直す。
