# On-chain facts

Every ProofMarket result that reaches settlement leaves one line on Solana: a **Task account** owned by the
ProofMarket program. Its outcome, `result_hash`, `evidence_root`, the wallets paid and the finalize time cannot be
changed afterwards, not even by the operator. Another program, or an off-chain service, can read that account
directly and act on the answer without trusting the ProofMarket API.

Design: `specs/proofmarket/implementation/ja/13-edge-features.md` §2.

- Network: Solana **Devnet**
- Program: `A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s`
- Account layout: `programs/proofmarket/src/state.rs` (`Task`), 417 bytes including Anchor's 8-byte discriminator

## Where the account is

```
task_id_hash = SHA-256("proofmarket:task:v1:" + verification_id)
task_account = PDA(["task", task_id_hash], program_id)
```

`GET /v1/public/verifications/{id}/onchain` (no auth, cached 60 s) returns the address together with the values
the settle transaction wrote:

```json
{
  "verification_id": "ver_01M42M6WXZ93MFR3YDQZ7JXEHG",
  "network": "solana-devnet",
  "program_id": "A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s",
  "task_account": "F2SBmkzsyFf5HvA8BVqAQzv26JsVhfqM9eVRfSKmWQcz",
  "recorded": true,
  "outcome": "VERIFIED",
  "result_hash": "sha256:92d4dfa8975f7004f819cdec214a2576005ed9f2b4a68907a81eeedc7c5f7c99",
  "evidence_root": "sha256:b32f9bd6a21f4fb4225803ee366bd1c6327e6e1c83f23c48e84ae24dd2236c2f",
  "finalized_at": "2026-10-04T05:02:34.000Z",
  "explorer_url": "https://explorer.solana.com/address/F2SBmkzsyFf5HvA8BVqAQzv26JsVhfqM9eVRfSKmWQcz?cluster=devnet",
  "how_to_read": { "rust": "…", "typescript": "…" }
}
```

`recorded` is false (and the hashes are null) until finalize + settle is confirmed. A task that expired with no
valid submission is refunded and never finalized, so its account has no `result_hash`. A result with no
result yet is 404. `finalized_at` here is when ProofMarket finalized the result; the account's own
`finalized_at` is the program clock at the finalize transaction, a few seconds later.

`outcome` uses the program's names: `VERIFIED`, `NO_CONSENSUS` (the API's `REJECTED`) and
`INSUFFICIENT_WITNESSES` (the API's `EXPIRED` with at least one valid submission).

## What `result_hash` covers

```
result_hash = SHA-256(JCS(pick(result, RESULT_HASH_FIELDS)))
RESULT_HASH_FIELDS = verification_id, status, reason, answer, witnesses, aggregate, answer_counts,
                     checks, rejected_submissions, evidence_root
```

JCS is RFC 8785 canonical JSON. Only these fields are hashed; anything else an API response carries (`proof`,
`consensus_ratio`, `attestation`, `settlement`, `verified_at`, and on the public result `type`, `answer_kind`,
`published`) is left out. For a text answer, `answer` is the SHA-256 of the text, so the text itself stays private.

Use the requester's result (`GET /v1/verifications/{id}` → `result`) to recompute it. The public result
(`GET /v1/public/verifications/{id}`) leaves out `rejected_submissions`; it then counts as `{}`. That is right
when nothing was rejected. Otherwise it gives a mismatch, never a false match. The public result also leaves out
`aggregate` (the sense index of a form, 13 §4), which is hashed only when 3 or more form answers were accepted;
for those, recompute from the requester's result.

`evidence_root` is the SHA-256 of the canonical evidence bundle (07 §5.1), which the requester can download.

## TypeScript: `verifyOnChain`

`packages/sdk` reads the account bytes itself (no IDL and no Anchor client), recomputes `result_hash` and
compares the two.

```ts
import { verifyOnChain } from "@proofmarket/sdk/onchain";

const check = await verifyOnChain({
  verificationId: "ver_01M42M6WXZ93MFR3YDQZ7JXEHG",
  result, // GET /v1/verifications/{id} → result (or the public result)
  rpcUrl: "https://api.devnet.solana.com", // the default
});
// { matches: true, task_account: "F2SB…", outcome: "VERIFIED", finalized_at: "2026-10-04T05:02:41.000Z",
//   evidence_root: "sha256:…", result_hash: "sha256:…", computed_result_hash: "sha256:…", reason: null }
```

`matches` is true only when the recomputed hash equals the one on chain. When it is false, `reason` says why in
one sentence (no account, never finalized, or a different result). The same module exports `taskPda`,
`readTaskAccount`, `decodeTaskAccount` and `TASK_OFFSETS` for readers that only want the raw fields.

## Rust: `AccountDeserialize`

Depend on the program crate for its types, with the `cpi` feature so it does not build an entrypoint:

```toml
proofmarket = { git = "https://github.com/shoripanda/proofmarket", features = ["cpi"] }
```

```rust
use anchor_lang::prelude::*; // brings AccountDeserialize
use proofmarket::state::{Outcome, Task};

fn read_task(task: &AccountInfo) -> Result<Task> {
    require_keys_eq!(*task.owner, proofmarket::ID);
    let data = task.try_borrow_data()?;
    Task::try_deserialize(&mut &data[..]) // checks the 8-byte discriminator
}
```

Always check the owner. Anyone can create an account with the same bytes under another program.

## Example: automatic insurance payout

A parametric policy pays out when a person confirms on site that the insured shop was closed by flooding. The
insurer creates the verification (MCP or REST), and its own program pays from a vault once the fact is on chain.

**Off-chain trigger** (a worker in the insurer's backend):

```ts
import { ProofMarketClient } from "@proofmarket/sdk";
import { verifyOnChain } from "@proofmarket/sdk/onchain";

const pm = new ProofMarketClient({ baseUrl: "https://proofmarket.fun", apiKey: process.env.PM_API_KEY! });
const v = await pm.getVerification(policy.verificationId);
if (v.result?.status === "VERIFIED" && v.result.answer === "CLOSED") {
  const check = await verifyOnChain({ verificationId: v.verification_id, result: v.result });
  if (check.matches) await sendClaimPayout(policy, check.task_account); // the program re-checks below
}
```

**On-chain check** inside the insurer's `pay_claim` instruction, so the payout cannot be triggered with a made-up
result:

```rust
#[derive(Accounts)]
pub struct PayClaim<'info> {
    #[account(mut, has_one = beneficiary)]
    pub policy: Account<'info, Policy>,
    /// CHECK: owner and contents verified in the handler
    pub task: UncheckedAccount<'info>,
    // … vault, beneficiary token account, token program
}

pub fn pay_claim(ctx: Context<PayClaim>) -> Result<()> {
    let policy = &mut ctx.accounts.policy;
    let task = read_task(&ctx.accounts.task.to_account_info())?;
    require!(task.task_id_hash == policy.task_id_hash, InsuranceError::OtherTask);
    require!(task.outcome == Outcome::Verified, InsuranceError::NotVerified);
    // The policy stored result_hash of the result it pays on (answer "CLOSED"); see "What result_hash covers".
    require!(task.result_hash == policy.expected_result_hash, InsuranceError::OtherAnswer);
    require!(task.finalized_at <= policy.ends_at, InsuranceError::TooLate);
    require!(!policy.paid, InsuranceError::AlreadyPaid);
    policy.paid = true;
    // … transfer from the vault to the beneficiary
    Ok(())
}
```

`policy.task_id_hash` is fixed when the policy is bound to a verification, so one result pays one policy once.
`expected_result_hash` is computed off chain from the expected result. When the result has fields that cannot be
known in advance, such as `checks`, compare `task.outcome` and keep the answer check in the off-chain trigger, or
let the beneficiary submit the result and recompute it on chain.

## Example: switching a booking

A booking platform holds two venues. It asks whether the outdoor venue is usable this morning and switches the
booking to the indoor one if it is not.

```ts
import { verifyOnChain } from "@proofmarket/sdk/onchain";

const v = await pm.getVerification(booking.checkId);
if (v.status === "SETTLED" || v.status === "VERIFIED") {
  const check = await verifyOnChain({ verificationId: v.verification_id, result: v.result! });
  if (!check.matches) throw new Error(`not the recorded result: ${check.reason}`);
  if (v.result!.answer === "UNUSABLE") await switchVenue(booking, "indoor", { proof: check.task_account });
}
```

In a program, the same switch reads the Task account in its `switch_venue` instruction with `read_task` above. It
requires `outcome == Outcome::Verified` and `finalized_at` within the booking's decision window, and keeps
`task_account` in the booking so the switch can be audited later.

## Limits

- Devnet only. The program and the accounts are real, but the tokens are test USDC.
- Results are finalized by a single verifier key run by the platform. The chain proves that the result was not
  changed afterwards. It does not prove that the verifier judged correctly.
- Photos, questions, places, workers and text answers are never on chain. Only their hashes are.
