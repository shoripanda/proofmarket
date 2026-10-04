# ProofMarket 提出までのスケジュール（Crypto World's Fair）

最終更新: 2026-10-04 16:10 JST
締め切り: 2026-10-12（Colosseum への提出）。提出後も開発は止めない（面談まで進捗を見せる）。

このファイルは、作業する人とエージェント全員の共有の予定表。作業を始めるとき・終えたときに「状態」を書き換える。
判断の根拠は `docs/colosseum-hackathon-winners-2024-2026.md` と `docs/colosseum-hackathon-playbook-2026-09-16.md`。

## 方針（2026-10-04 に決定）

1. **看板は「人の作業の結果を、依頼した AI が信用できる形で返す」**。「AI が人を雇う」だけでは RentAHuman・Taskin・NeedaHuman と重なる（`specs/proofmarket/competitor-differentiation.md`）。差は、AI による内容の確認（01 §4.16–4.17）・複数人の合意・Solana に残る結果の記録の3つ。
2. **どの AI でも、登録なしで使える**。x402 で、エージェントが Solana の USDC をその場で払って依頼できるようにする。
3. **最初の入口は「日本の紙と現地にしか無い情報」**（紙の資料・店頭の掲示・窓口や電話でしか分からないこと）。※オーナーの最終確認待ち
4. **実績を数字で見せる**。審査までの目標: worker 10〜20人、完了した依頼 50〜100件、外部の AI 開発者の試用数件。
5. 作業は1つずつ終わらせて次へ進む。終わったものから宣伝（X）に使う。

## 今日（10/4）19:00 JST までの作業

オーナーがターミナルで画面を担当の数だけ開き、それぞれに `docs/agents/README.md` と担当の指示書を読ませて進める。エージェントは自分でサブエージェントを起動しない（トークンを大量に使うため）。

| 担当 | 作業 | 指示書 | 状態 |
|---|---|---|---|
| — | この予定表と指示書をリポジトリに置く | — | 完了 |
| A | x402 で、API キーなしに USDC を払って依頼できる窓口と、払って依頼する見本のエージェント | `docs/agents/A-x402.md` | 未着手 |
| B | 証拠の写真を最大4枚にする | `docs/agents/B-multi-photo.md` | 未着手 |
| C | 公開の実績ページ `/stats` と、サイトの看板の言い換え | `docs/agents/C-stats-and-copy.md` | 未着手 |
| D | ピッチ資料・動画3本の台本・X の投稿文・worker 募集文（文書だけ） | `docs/agents/D-pitch-materials.md` | 未着手 |
| E | Claude・ChatGPT から本番の MCP / API につなぐ確認と、接続手順のページ | `docs/agents/E-agent-clients.md` | 未着手 |
| 本体 | 各担当の「本番で必要な手順」（Supabase の移行、launchd の入れ直しなど）をまとめて行う | — | 待機 |

## 10/5〜10/12

| 日程 | 作業 | 担当 |
|---|---|---|
| 10/5〜10/10 | worker を集める（知人・大学・X）。招待コードは `issue-invite.ts` で発行 | オーナー（Claude は募集文・手順書を用意） |
| 10/5〜10/10 | 実際の依頼を毎日回す（見本のエージェントから定期的に）。数字を `/stats` で公開 | Claude |
| 10/5〜10/9 | 外部の AI 開発者に試してもらう（x402 / MCP の手順を渡す） | オーナー |
| 10/7〜10/11 | ピッチ資料の仕上げ、動画3本の収録と編集 | オーナー（声・出演）、Claude（台本・画面収録の段取り・編集素材） |
| 毎日 | X で開発の進み具合を発信（Build in Public） | オーナー（下書きは Claude） |
| 10/12 | 提出 | オーナー |

## オーナーにしか決められないこと

- 最初の入口（方針 3）の確定
- 創業者の物語（なぜこの問題をやるのか）
- worker を頼める人の当て
- ピッチ動画の声・出演

## 動いている環境

- 本番: https://proofmarket-rosy.vercel.app （GitHub main に入ると自動で公開）
- データベース: Supabase（移行は `DATABASE_URL=<Session pooler> pnpm db:migrate`）
- Solana: Devnet（program `A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s`）
- AI による内容の確認: オーナーの Mac の launchd `com.proofmarket.review-runner`（2分ごと、`scripts/review-runner.ts`）
- 秘密の値は `~/.config/proofmarket/` にだけ置く。リポジトリとチャットには書かない

## 本番で必要な手順（各担当が書き足す）

- （まだ無い）
