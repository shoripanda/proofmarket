# 並行作業の指示書（ProofMarket・提出前の追い込み）

作成: 2026-10-04 16:00 JST ／ 予定表: `docs/proofmarket-schedule-2026-10.md`

オーナーがターミナルで Claude Code の画面を担当の数だけ開き、それぞれに次のように頼む。

```
docs/agents/README.md と docs/agents/<担当のファイル> を読んで、その作業を進めて
```

**エージェントは自分でサブエージェント（Agent / fork / Workflow）を起動しない。** トークンを大量に使うため。1つの画面で1つの担当を、最後まで自分で進める。

## 割り振り

| 担当 | 指示書 | 内容 | 触る主な場所 | 目安 |
|---|---|---|---|---|
| A | `A-x402.md` | x402: API キーなしで USDC を払って依頼できる窓口と、払って依頼する見本のエージェント | `apps/web/app/v1/x402/`、`apps/web/lib/services/`、`scripts/` | 2.5 時間 |
| B | `B-multi-photo.md` | 証拠の写真を最大4枚に | `evidence-service.ts`、撮影画面、`review-runner.ts` | 2 時間 |
| C | `C-stats-and-copy.md` | 公開の実績ページ `/stats` と、サイトの看板の言い換え | `apps/web/app/(site)/` | 2 時間 |
| D | `D-pitch-materials.md` | ピッチ資料・動画3本の台本・X の投稿文・worker 募集文（文書だけ） | `docs/pitch/` | 2 時間 |
| E | `E-agent-clients.md` | Claude・ChatGPT などから本番の MCP / API につなぐ確認と、接続手順のページ | `apps/web/app/(site)/developers/`、`docs/` | 1.5 時間（オーナーの画面操作あり） |

## 全員の決まり

### 始める前に
1. リポジトリの `CLAUDE.md`（特に「失敗ルート台帳」）と `AGENTS.md` を読む。
2. `docs/proofmarket-schedule-2026-10.md` の自分の行の「状態」を「作業中」にする（コミットは自分の PR に含める）。
3. 作業はリポジトリの複製で行う。同じフォルダで2つの画面が同時にブランチを切り替えると壊れるため、最初に自分用の worktree を作る。
   ```
   cd ~/Solana-idea && git fetch -q && git worktree add ../Solana-idea-<担当> -b <ブランチ名> origin/main
   cd ../Solana-idea-<担当> && pnpm install
   git config user.email 131566598+shoripanda@users.noreply.github.com && git config user.name shoripanda
   ```

### ぶつかりやすい場所
- `packages/core/src/schemas/api.ts` と `packages/core/openapi.json` は A・B・C が触る。PR を出す前に `git rebase origin/main` し、`pnpm openapi` で作り直してからコミットする。
- DB の移行の番号は先に決めておく。**A は 0019、B は 0020**。C・D・E は移行を作らない。番号を飛ばしても drizzle は動く。
- `CLAUDE.md` の失敗ルート台帳に足すときは、末尾に1行足すだけにする（並べ替えない）。

### 本番には触らない
- Supabase への `db:migrate`、Vercel の設定、本番の管理 API（`/v1/admin/*`）、本番の DB への書き込みはしない。必要なら PR の本文と報告に「本番で必要な手順」として書く。本番の作業はオーナーの最初の画面（この指示書を書いたセッション）がまとめて行う。
- 秘密の値は `~/.config/proofmarket/` にだけある。リポジトリ・PR・チャットに書かない。

### 仕上げ
1. `pnpm exec biome check --write .` のあと `pnpm exec biome ci .` でエラー 0。
2. `pnpm typecheck`、`pnpm --filter @proofmarket/web exec vitest run --no-file-parallelism`、`pnpm -r --filter '!@proofmarket/web' run test`。
3. 画面や API を変えたら `APP_ENV=demo pnpm build`（終了コードで判断する）。
4. 日本語の文章（画面の文言・仕様書・資料）は `natural-japanese` スキルの基準を通す。
5. push して PR を出す。本文の最後に、Claude Code が示す帰属表示の行を付ける。
6. CI（typescript・program・secrets）がすべて通ったら、自分で `gh pr merge --merge` してよい（オーナーの許可済み）。Vercel のプレビューの失敗は、コードの問題でなければ止める理由にしない。
7. `docs/proofmarket-schedule-2026-10.md` の自分の行を「完了」にし、本番で必要な手順があれば同じファイルの末尾「本番で必要な手順」に書く（別の PR でよい）。
8. 最後にオーナーへ、日本語で短く報告する: PR の URL、できたこと、確かめたこと、本番で必要な手順、残したこと。

### 迷ったら
仕様は `specs/proofmarket/implementation/ja/` が正本。範囲や P0 の要件を変えるときは、先に仕様書に理由を書く（`CLAUDE.md` の決まり）。判断に迷うことはオーナーに聞く。推測で範囲を広げない。
