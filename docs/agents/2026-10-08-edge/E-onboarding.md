# 担当 E: 初心者の導線（設計書 §7）

ブランチ: `feat/onboarding-visual`。worktree: `~/proofmarket-e`。サーバーも DB も触らない。

## 作るもの

### サイト
1. **30 秒でわかる**（トップ `apps/web/app/(site)/page.tsx` の最初の節）
   - `apps/web/components/explainer.tsx`: `FlowDiagram`（`flow-diagram.tsx`）を大きく出し、6 場面の語りに合わせて点灯を進める。再生ボタン 1 つ（線画の三角）。語りは mp3 を `<audio>` で再生し、`timeupdate` で場面を切り替える（場面ごとの開始秒は JSON に持つ）。字幕は 1 行（その場面の 1 文）。音が出せない環境では字幕だけで自動で進む
   - 語りの音声は Kokoro で作る: `docs/pitch/03-videos/render/README.md` の「準備」に従い（環境は旧 scratchpad `tts/` にある。無ければ README の手順で入れる）、日本語 6 文・英語 6 文を `apps/web/public/audio/explainer-{ja,en}.mp3` に（`ffmpeg` で連結、各文の開始秒を `explainer-{ja,en}.json` に）。日本語の声は Kokoro の `jf_alpha` 等を試し、無理なら英語だけ音声・日本語は字幕のみでよい（PR の説明に書く）。合計 30 秒以内。文は設計書 §7 の 6 場面に合わせ、専門語は使わない
2. **やさしい言葉**: `apps/web/lib/client/plain.tsx` に `PlainProvider`・`usePlain()`・`<Term k="solana">`。対応表（設計書 §0）: solana / usdc / escrow / mcp / x402 / api-key / wallet。やさしい言葉が**オン**のとき置き換え、オフで元の語。ヘッダー（`components/site.tsx` の `SiteShell`）に切り替え（「やさしい言葉」トグル、`localStorage` `pm.plain`、既定オン）。トップ・/how-it-works・/workers・/join・/pricing の本文中の専門語を `<Term>` で包む（`/developers` は包まない。開発者向けのため）
3. **/how-it-works** の各節に絵を 1 枚（SVG の線画: カメラ・検査の列・2 人の一致・台帳）。`components/illustrations.tsx` にまとめる。節の文は見出しと 1 文だけ残し、残りは `<details>` に畳む
4. **/workers** を「3 枚の絵と 3 文」に: 登録（スマホ）→ 近くの依頼（地図のピン）→ 撮って答えて受け取る（カメラとコイン）。各絵の下に 1 文と `ListenButton`（担当 D が作る。無ければ `speechSynthesis` を直接 5 行で）。既存の詳しい文は下に畳む

### worker アプリ
5. 初回だけ 3 画面の案内（`apps/web/app/(worker)/tasks/page.tsx` の初回表示、`localStorage` `pm.tour=done`）: 「近くの依頼を見る」「撮って答える」「報酬を受け取る」。絵（上の線画を流用）・1 文・読み上げボタン・「飛ばす」。`components/tour.tsx`
6. 専門語を使わない: worker 画面の `USDC` の額に円の目安を添える（`ui.tsx` の `yen()` を「0.30 USDC（約 45 円）」に。レートは `lib/client/rate.ts` の固定値 150 円、注記「目安」）

### /try
7. エージェントの「考え」の吹き出しを読み上げる切り替え（`try-experience.tsx`。既定オフ、`speechSynthesis`）

## 確かめ方
文字を全部隠しても（開発者ツールで `color: transparent`）流れが追えるスクリーンショットをトップ・/how-it-works・/workers・worker の案内で撮り、`docs/agents/2026-10-08-edge/e-screens/` に置く（PNG、幅 390px）。

## できたの判定
上のスクリーンショットで、絵と音だけで流れが分かる。やさしい言葉の切り替えで専門語が消える。
