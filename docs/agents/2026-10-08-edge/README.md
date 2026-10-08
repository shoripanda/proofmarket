# 並行作業の指示書（尖った機能と初心者の導線・2026-10-08）

設計の正本: `specs/proofmarket/implementation/ja/13-edge-features.md`（以下「設計書」）。背景: `docs/pitch/07-landscape-and-edge.md`。要件: 01 §4.26。

オーナーがターミナルで Claude Code の画面を担当の数だけ開き、それぞれに次のように頼む。

```
docs/agents/2026-10-08-edge/README.md と docs/agents/2026-10-08-edge/<担当のファイル> を読んで、その作業を最後まで進めて
```

**エージェントは自分でサブエージェント（Agent / fork / Workflow）を起動しない。** 1 つの画面で 1 つの担当を、最後まで自分で進める。

## 割り振り

| 担当 | 指示書 | 中身（設計書の節） | 触る主な場所 | 大きさ |
|---|---|---|---|---|
| A | `A-rising-bounty.md` | 急ぐほど上がる報酬（§1）。Solana プログラム v1.1 を含む | `programs/`、`packages/solana`、`requester-service`、`worker-service`、`settlement-jobs`、worker の一覧・詳細 | 大 |
| B | `B-onchain-facts.md` | 他のプログラムから読める事実（§2） | `packages/sdk`、`apps/web/app/v1/public/`、`apps/web/app/r/[id]`、`docs/onchain-facts.md` | 中 |
| C | `C-attestation-and-scale.md` | エージェントの行いの証明（§5）と五感の指数（§4） | `api.ts`、`answers.ts`、worker の撮影画面、`views.ts`、証明ページ、`/developers` の見本 | 中 |
| D | `D-worker-assist.md` | worker 側のブラウザ内の助け（§6）: 読み上げ・声で答える・撮影の案内・音 | `apps/web/app/(worker)/`、`apps/web/components/ui.tsx`、新規 `apps/web/lib/client/speech.ts`・`sound.ts` | 中 |
| E | `E-onboarding.md` | 初心者の導線（§7）: 30 秒の動く説明と語り、やさしい言葉、絵、/workers、worker の初回案内、/try の読み上げ | `apps/web/app/(site)/`、`apps/web/components/`、`apps/web/public/audio/` | 大 |
| F | `F-optimistic.md` | 楽観的な確認（§3） | `verification-service`、`requester-service`、`task-engine`、新規 `challenge-service`、API・MCP・Webhook | 大 |
| G | `G-location-privacy.md` | 公開面の位置の丸め（§9 の PR 7） | `public-service`、`map-service`、`bundle.ts`、証明ページ、データセット | 小〜中 |

本体（この指示書を書いたエージェント）は、移行 `0023_edge_features` と `schema.ts` を先に main へ入れる（PR 「db: migration 0023」）。**全員、その PR が main に入ってから始める**（`git log origin/main --oneline | head` に `db: migration 0023` が見えること）。入っていなければオーナーに聞く。

## 全員の決まり

### 始める前に
1. リポジトリの `CLAUDE.md`（特に「失敗ルート台帳」）と `AGENTS.md` を読む。設計書の自分の節を全部読む。分からない点は設計書の決めごと（§0）に従い、勝手に設計を変えない。変えたいときは PR の説明に理由を書く。
2. 自分用の worktree を作る。同じフォルダで 2 つの画面がブランチを切り替えると壊れるため。
   ```
   cd ~/proofmarket && git fetch -q && git worktree add ../proofmarket-<担当> -b <ブランチ名> origin/main
   cd ../proofmarket-<担当> && pnpm install
   git config user.email 131566598+shoripanda@users.noreply.github.com && git config user.name shoripanda
   ```
   `pnpm build`（Next.js のビルド）は worktree では**回さない**（ディスクが 1GB 減る。CI が回す）。
3. `docs/agents/2026-10-08-edge/STATUS.md` の自分の行を「作業中」にして最初のコミットに含める。

### 禁止
- `git stash`、`git checkout <別ブランチ>`（worktree 内で）、`git commit -am`、`git push --force`。
- 本番（Supabase・Vercel・proofmarket.fun・Solana devnet の Config）への書き込み。例外は A のプログラムのデプロイ（指示書に手順あり）。
- 移行ファイルの追加。列が足りなければ本体に言う（STATUS.md に書く）。
- 他の担当の節の実装。自分の節だけ。

### ぶつかりやすい場所
- `packages/core/src/schemas/api.ts`・`packages/core/openapi.json`・`packages/core/src/domain/enums.ts`・`apps/web/lib/answers.ts` は複数の担当が触る。PR を出す前に `git fetch && git rebase origin/main` し、`pnpm openapi` で作り直してからコミットする。衝突したら、相手の変更を残して自分の分を足す。
- MCP のツールの説明（`packages/mcp/src/tools.ts`）は A・C・F が 1 文ずつ足す。既存の文を消さない。
- `CLAUDE.md` の失敗ルート台帳に足すときは末尾に 1 行だけ。

### 終わり方
1. 手元で `pnpm typecheck`・`pnpm exec biome ci .`・`pnpm --filter @proofmarket/core exec vitest run`・`pnpm --filter @proofmarket/web exec vitest run --no-file-parallelism` を通す（負荷が高いときは直列で）。
2. `git fetch && git rebase origin/main` → push → `gh pr create`。題は `feat(<担当の英名>): ...`。説明には設計書の節と「できたの判定」をどう確かめたかを書く。末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
3. CI（program / typescript / secrets）が全部 pass になったら自分で `gh pr merge <番号> --merge --delete-branch` してよい（オーナーの許可済み）。`gh pr merge` は CI 未完了でも通ってしまうので、`gh pr checks` で pass を確かめてから。
4. STATUS.md の自分の行を「完了」にし、分かったこと（はまりどころ・残り）を 3 行以内で書く。これは main に直接コミットして push してよい（この 1 ファイルだけ）。
