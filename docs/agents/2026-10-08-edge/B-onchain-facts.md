# 担当 B: 他のプログラムから読める事実（設計書 §2）

ブランチ: `feat/onchain-facts`。worktree: `~/proofmarket-b`。プログラムも DB も触らない。

## 作るもの

1. **SDK**（`packages/sdk/src/`）
   - `onchain.ts`: `taskPda(verificationId, programId)`（seed `["task", sha256("proofmarket:task:v1:" + id)]`。`taskIdHash` は `@proofmarket/core` にある）、`readTaskAccount(rpcUrl, address)`（`@solana/web3.js` の `getAccountInfo` で生のバイト列を取り、Anchor の口座レイアウト = 8 バイトの判別子 + `programs/proofmarket/src/state.rs` の `Task` を Borsh で手で読む。`recipients` は `[Pubkey; MAX_RECIPIENTS]`、定数は `constants.rs`）、`verifyOnChain({ verificationId, result, rpcUrl, programId })` → `resultHash(result)`（`@proofmarket/core` の `resultHash`。除外項目はそこで処理される）と口座の `result_hash` を比べ、`{ matches, task_account, finalized_at, outcome, evidence_root, result_hash }` を返す
   - `packages/sdk` に `@solana/web3.js` を足す（`packages/solana` が使っている版に合わせる）。Anchor の IDL や `@coral-xyz/anchor` は持ち込まない
   - テスト: `packages/sdk/test/onchain.test.ts`。Borsh の読みは `packages/solana/test/localnet.test.ts` のやり方で LiteSVM か、固定のバイト列（手で作る）で確かめる。本番の結果 1 件（`GET /v1/public/verifications/{id}` にある `attestation.task_account`）で `matches: true` になることも手元で確かめ、PR の説明に書く

2. **公開 API**: `GET /v1/public/verifications/{id}/onchain`（`apps/web/app/v1/public/verifications/[id]/onchain/route.ts`、`public-service.ts` に関数）。返すもの: `task_account`、`program_id`、`result_hash`、`evidence_root`、`outcome`、`finalized_at`、`explorer_url`、`how_to_read: { rust, typescript }`（10 行ずつの断片）。認証なし、`Cache-Control: public, max-age=60`。結果が無い依頼は 404。`openapi/build.ts` に足して `pnpm openapi`

3. **証明ページ `/r/[id]`**: 「プログラムから読む」の節を結びの前に足す。上に初心者向けの 1 文「この答えは、だれにも書き換えられない台帳に 1 行で残っています」と台帳の絵（SVG の線画、既存の `flow-diagram.tsx` の `chain` アイコンを流用してよい）。下に折りたたみ（`<details>`）で PDA のアドレス、`result_hash` の作り方（JCS、除外項目）、Rust と TypeScript の断片。日英両方（`pick(lang, …)`）

4. **文書**: `docs/onchain-facts.md`（英語）。保険の自動支払いと予約の切り替えの例を、`verifyOnChain` の呼び出しと Anchor の `AccountDeserialize` の両方で。`/developers` の MCP の節の下に「On-chain facts」の短い節（日英）とリンク

## できたの判定
`verifyOnChain` が本番の結果で `matches: true`。`/r/{id}` に PDA と読み方が出る。`/v1/public/verifications/{id}/onchain` が 200 で返る。
