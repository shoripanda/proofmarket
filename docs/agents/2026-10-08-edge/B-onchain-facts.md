# Owner B: facts other programs can read (design §2)

Branch: `feat/onchain-facts`. Worktree: `~/proofmarket-b`. Touch neither the program nor the DB.

## What to build

1. **SDK** (`packages/sdk/src/`)
   - `onchain.ts`: `taskPda(verificationId, programId)` (seed `["task", sha256("proofmarket:task:v1:" + id)]`; `taskIdHash` is in `@proofmarket/core`), `readTaskAccount(rpcUrl, address)` (fetch the raw bytes with `getAccountInfo` from `@solana/web3.js` and decode by hand with Borsh using Anchor's account layout = an 8-byte discriminator + `Task` from `programs/proofmarket/src/state.rs`; `recipients` is `[Pubkey; MAX_RECIPIENTS]`, constants in `constants.rs`), and `verifyOnChain({ verificationId, result, rpcUrl, programId })` → compare `resultHash(result)` (`resultHash` from `@proofmarket/core`, which handles the excluded fields) with the account's `result_hash` and return `{ matches, task_account, finalized_at, outcome, evidence_root, result_hash }`
   - Add `@solana/web3.js` to `packages/sdk` (same version as `packages/solana`). Do not bring in the Anchor IDL or `@coral-xyz/anchor`
   - Tests: `packages/sdk/test/onchain.test.ts`. Check the Borsh decoding with LiteSVM, following `packages/solana/test/localnet.test.ts`, or with fixed hand-made bytes. Also check locally that one production result (`attestation.task_account` in `GET /v1/public/verifications/{id}`) gives `matches: true`, and write it in the PR description

2. **Public API**: `GET /v1/public/verifications/{id}/onchain` (`apps/web/app/v1/public/verifications/[id]/onchain/route.ts`, with the function in `public-service.ts`). Returns `task_account`, `program_id`, `result_hash`, `evidence_root`, `outcome`, `finalized_at`, `explorer_url` and `how_to_read: { rust, typescript }` (10-line snippets each). No auth, `Cache-Control: public, max-age=60`. 404 for requests without a result. Add it to `openapi/build.ts` and run `pnpm openapi`

3. **Proof page `/r/[id]`**: add a "Read it from a program" section before the closing. Above, one sentence for beginners — "This answer is recorded as one line in a ledger nobody can rewrite" — and a ledger illustration (SVG line art; the `chain` icon of the existing `flow-diagram.tsx` may be reused). Below, a collapsible `<details>` with the PDA address, how `result_hash` is made (JCS, excluded fields), and the Rust and TypeScript snippets. Japanese and English (`pick(lang, …)`)

4. **Docs**: `docs/onchain-facts.md` (English), with examples of automatic insurance payout and switching a booking, using both `verifyOnChain` and Anchor's `AccountDeserialize`. A short "On-chain facts" section (Japanese and English) with a link, below the MCP section of `/developers`

## Done when
`verifyOnChain` gives `matches: true` on a production result. `/r/{id}` shows the PDA and how to read it. `/v1/public/verifications/{id}/onchain` returns 200.
