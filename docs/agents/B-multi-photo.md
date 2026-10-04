# 担当 B: 証拠の写真を最大4枚にする

ブランチ: `feat/multi-photo` ／ worktree: `../Solana-idea-b` ／ DB の移行番号: 0020（必要なときだけ）

## なぜやるか
いまは1回の提出で写真1枚だけ。「店の外観と値札」「本の表紙と本文のページ」のように、複数枚あって初めて確かめられる依頼に対応できない。AI による内容の確認（01 §4.16–4.17）も、写真が増えれば判断しやすくなる。

## 作るもの
1. **API**: `SubmitEvidenceRequestSchema` の `evidence` を1〜4枚にする。写真ごとにアップロードを1つ作る。どれも同じ引き受け・同じ合言葉（challenge）に属すること。アップロード作成の窓口は、1つの challenge に4つまで許す。
2. **サーバー**（`apps/web/lib/services/evidence-service.ts`）
   - アップロードをすべて検証する（引き受け・challenge・PENDING）。
   - 写真ごとに形式・使い回し・似た写真の検査をする。1枚でも落ちたら、その理由で提出全体を不合格にする。
   - 写真ごとに `evidence_objects` の行と縮小版を作る。evidence バンドルの `evidence_sha256` に全部入れる（もともと配列）。
   - 依頼者向けの写真の URL（`GET /v1/verifications/{id}/evidence`）は全部を返す。
3. **AI による内容の確認**
   - サーバー内の確認（`lib/adapters/claude-reviewer.ts`）: `ReviewInput.image` を `images: Buffer[]` にし、全部を Claude に渡す。
   - 外部の確認（`listPendingReviews`）: `image_url` を `image_urls` の配列にする。
   - `scripts/review-runner.ts`: 全部をダウンロードし、プロンプトにすべてのパスを並べる。`--try` は1枚でも動くように残す。
   - **注意**: オーナーの Mac で review-runner が2分ごとに本番に対して動いている。サーバーとスクリプトの形が食い違う期間ができないよう、サーバーは古い形（`image_url`）も当面は一緒に返す。
4. **worker の撮影画面**（`apps/web/app/(worker)/claims/[id]/capture/page.tsx`）: 4枚まで撮れるようにする。撮った写真の縮小表示、1枚ずつ消す、「もう1枚撮る」。送信時に全部アップロードしてから提出する。文言は短く自然な日本語で。
5. **仕様書**: `01-requirements-definition.md` に「4.18 写真の複数枚化（2026-10-04）」を足す。07 章の検査の説明も合わせる。

## 触らないもの
- 判定の規則そのもの（多数決・文章の扱い）。
- 本番の DB・Vercel・review-runner の launchd の設定（スクリプトのコードは直してよい。取り込み後にオーナーの最初の画面が launchd を入れ直す）。

## 完了の条件
- テスト（`test/support/worker.ts` の `witness` に複数枚を送れる口を足す）: 2枚で合格／1枚が使い回しなら不合格／確認役（偽の reviewer）が全部の写真を受け取る／外部の確認の一覧に全部の URL が出る。既存のテストはすべて通す。
- README の「仕上げ」を満たして PR を取り込む。
