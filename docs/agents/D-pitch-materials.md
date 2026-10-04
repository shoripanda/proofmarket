# 担当 D: 提出用の資料（文書だけ）

ブランチ: `docs/pitch-materials` ／ worktree: `../Solana-idea-d` ／ コードは書かない

## 先に読むもの
- `docs/colosseum-hackathon-playbook-2026-09-16.md`（攻略メモ。ピッチ動画が最重要、3分未満、構成、Red Flag Word List）
- `docs/colosseum-hackathon-winners-2024-2026.md`（過去の入賞作）
- `specs/proofmarket/competitor-differentiation.md`（RentAHuman・Taskin・NeedaHuman との違い）
- `specs/proofmarket/project-brief.md`、`problem.md`
- `specs/proofmarket/implementation/ja/01-requirements-definition.md` の 4.15〜4.17 節（実際に作ったもの）
- `docs/proofmarket-schedule-2026-10.md` の「方針」

## 方針（資料はこれに合わせる）
- 看板: **人の作業の結果を、依頼した AI が信用できる形で返す。**
- 差のつく点: 提出ごとの AI による内容の確認、複数人の合意、Solana に残る結果の記録とエスクローでの支払い、x402 で登録なしに依頼できること（担当 A が今日作る）。
- 最初の入口（オーナーの確認待ち）: 日本の、紙と現地にしか無い情報。AI はそこに手が届かない。
- **数字は作らない。** 実績は `【完了件数】` のような置き場所にし、オーナーが `/stats` から埋める。
- **創業者の物語は作らない。** はっきり分かる置き場所にし、オーナーが答える問いを3つ添える。

## 作るもの（`docs/pitch/` に置く）
1. `canvas.md` — Hackathon Canvas（課題、最初の狭い利用者、いまの代わりの手段、独自の価値、なぜ今か、なぜ暗号資産か、なぜ Solana か、広げ方の入口、MVP、期間中に測る数字）と、Matty Taylor の6つの問いへの正直な答え（埋められない所は置き場所に）。
2. `deck.md` — ピッチ資料のスライドごとの構成。Hook→Problem→Solution→Product→Demo→Business Model→Traction→Team→CTA、12枚以内。各スライドに題・一言・見せる絵の案・話す内容。日本語版と英語版。
3. `pitch-video-script.md` — 3分未満。秒数つきのカット表とナレーション（審査員向けに英語、横に日本語訳）。
4. `demo-video-script.md` — 3分未満の技術デモ: エージェントが x402 か MCP で依頼 → worker のアプリ → AI が差し戻し → 直して合格 → Solana Explorer でエスクロー・結果の記録・支払い → `/stats`。収録する画面の一覧つき。
5. `hype-video-script.md` — 20〜40秒の予告編。
6. `x-posts.md` — 10/5〜10/12 の Build in Public の投稿10本。創業者の個人アカウント用（日本語）とプロジェクトのアカウント用（英語）。投稿ごとに画像・動画の案。リンクは最初の投稿ではなく返信に置く。ハッシュタグは多用しない。
7. `worker-recruiting.md` — 知人・大学・X 向けの短い募集文（日本語）と、1ページの「はじめての worker 手順」（ログイン → 招待コード → 依頼を引き受ける → 写真と答え → AI の確認 → 報酬）。

日本語は `natural-japanese` スキルを呼び出し、その基準でチェックする。

## 完了の条件
- 7つのファイルがそろい、オーナーが埋める置き場所の一覧を PR の本文と報告に書く。
- README の「仕上げ」のうち、PR と報告の部分を満たす（コードのテストは不要。`pnpm exec biome ci .` だけ通す）。
