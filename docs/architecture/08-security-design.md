# 08. Security design: 9 of the 12 requirements are met; design fills the other 3

Written: 2026-10-14 / Authoritative: chapter 08 (threats and countermeasures), `docs/security/program-review-2026-10-13.md`, `docs/legal/2026-10-13-owner-decision.md`

## 1. Purpose

Check the 12 items in section 8 of the brief (wallet signatures, secret keys, mint and network verification, malicious transactions, double payment, replay, API key leaks, agents with excessive authority, smart-contract vulnerabilities, disputes, fraudulent deliverables, mis-sending real funds) against the existing countermeasures and design what is missing, with emphasis on spending limits, approval policy and kill switches.

## 2. Current state

| Requirement | Existing countermeasure | Rating |
|---|---|---|
| Wallet signature safety | Wallet signatures are not used for auth. Workers use Privy access tokens; x402 verifies the transaction signature against every MUST in the spec | Met |
| Secret key management | admin is offline. operator and verifier are in Vercel env vars. `server-only` and the CI bundle check prevent leaks. Devnet keys are refused on mainnet | **Partial** (the keys that will hold real money on mainnet are in env vars) |
| Verifying the USDC mint and network | Genesis hash checked at startup. On mainnet `BOUNTY_MINT` is fixed to USDC. The program accepts only `Config.bounty_mint` and `AllowedMint`. x402 checks mint and decimals | Met |
| Malicious transactions | Transactions the server sends are built from the IDL, with accounts fixed by PDAs and `address =`. x402 checks the instruction sequence and that the fee payer is absent | Met |
| Double payment | State checks, `settle_xor_refund`, `dedupe_key`, Task PDA uniqueness | Met |
| Replay attacks | Idempotency keys, the `x402_payments` primary key, a unique SHA-256 constraint on evidence, challenge nonces | Met |
| API key leaks | Stored as SHA-256, revoke and suspend, rate limits, only the first 8 characters logged | Met (no rotation by the requester) |
| AI agents with excessive authority | Spending only within the balance; allow lists for types and regions | **Partial** (per-request and daily limits not checked; no approval step) |
| Smart-contract vulnerabilities | Operator review (2026-10-13), 23 LiteSVM tests, `overflow-checks`, checked_mul | Partial (no third-party audit; upgrade authority still the deploying key) |
| Requester-worker disputes | Disputes and rechecks, audit_events, operator suspensions | Met (within the design) |
| Fraudulent deliverables | 6 machine checks, AI review, pHash, in-app camera | Met (with the limits assessed in chapter 07) |
| Mis-sending real funds | `settle` checks the recipient's ATA and mint. An empty wallet is paid at least the rent. The treasury is fixed to the operator's ATA | Met |

Kill switches are the five `platform_flags` (new requests, claims, settlement, public evidence, human review), the program's `paused` (`update_config`), and suspending credentials and workers; each takes effect within a minute (08 §6).

## 3. Requirements

Fill the three partial items: (1) spending limits and approval policy, (2) where keys live, (3) the program's upgrade authority and an audit. Also add a flag to stop the x402 window on its own.

## 4. Proposed design

### 4.1 Spending brakes (three layers)

| Layer | What it bounds | Implementation |
|---|---|---|
| Balance | Cannot spend more than the requester put in | Existing (`INSUFFICIENT_BALANCE`) |
| Credential limits | Amount per request and daily total; null disables | 04 §4.3, reusing the existing error codes |
| Quote and approval | Shows the cost before paying so the agent runtime can stop for a person | 04 §4.2: MCP `confirm: false` and REST `mode: "quote"` |

PR #14's reason for removing limits (a requester should be free to spend within their own balance) is kept by making null the default. Keys from `/join` and x402 get 5 USDC and 20 USDC: a ceiling for requesters whose identity the operator does not know. A requester who wants more asks the operator to raise it.

### 4.2 Where keys live

Put the Signer boundary from 05 §4.1 in place and move mainnet's operator and verifier to a KMS or MPC. Until then, the treasury cap from 15 §4.2 and 05 §4.3 (provisionally 200 USDC and 2 SOL) is the ceiling on damage. admin lives on a hardware wallet, with `Config.admin` and the upgrade authority on the same key. The original keys (`~/.config/proofmarket/mainnet/`) stay with the operator, with exactly one copy kept elsewhere (guess: the current storage practice was not read).

### 4.3 An added kill switch

Add `x402_enabled` to `platform_flags`. The x402 window works without an API key and has only per-IP rate limits, so it should be possible to stop just the window when abuse appears. While stopped it returns `503 FEATURE_DISABLED` instead of 402. Toggled with `POST /v1/admin/flags`, like the other five.

### 4.4 Upgrade authority and audit

Move the upgrade authority to admin's hardware wallet right after deploying to mainnet (05 §4.2). Request a third-party audit after v1.3 (Token-2022) is deployed: auditing v1.2 would be redone, since v1.3 changes the instructions (`transfer_checked`, an allow list of extensions). Until the audit, the treasury cap is the ceiling on damage.

### 4.5 Logs and monitoring

Add the daily reconciliation from 06 §4.2 and the record of who ran each review from 07 §4.4 to the existing 08 §5 (JSON logs, four tick warnings). What is never logged (tokens, nonces, coordinates, keys) is unchanged.

## 5. Rationale

Spending brakes are off-chain because the requester's identity and limits exist only off-chain; the program knows "whose request" only as `requester_ref_hash`. Kill switches are added as flags because the existing mechanism is proven to take effect within a minute, and there is no reason for a new path.

## 6. Alternatives

- A multisig for the operator key. `initialize_task` and `settle` are sent automatically by the tick every minute, so a multisig that waits for people does not work. A KMS (signs automatically, but the key never leaves) is the right shape
- Giving each requester an on-chain account instead of holding their balance (G-11, P2; it also helps with the legal question D-05). A large design change, to be handled separately after mainnet

## 7. Security considerations (weaknesses of this design itself)

Even with the Signer on a KMS, the server decides what gets signed. If the server is compromised, the operator's authority can send `refund(Cancelled)` and return in-progress bounties to the treasury (review item 1). The damage is capped by the treasury cap plus the total of in-progress bounties in vaults, and goes no further. Lowering it would need the program to know "no refund while a claim is in progress", but claims exist only off-chain. Accepted.

Quotes and approval only help when the agent runtime has an approval feature. Omitting `confirm` reserves immediately as today, so existing users see no change.

## 8. Implementation issues

- Adding `x402_enabled` to the CHECK constraint on `platform_flags` (`platform_flags_key_chk`) needs a migration (chapter 09, 0030)
- The `pm_live_` prefix (04 §4.4) must also be added to the regex in the CI bundle check (`pm_test_[A-Za-z0-9_-]{8,}`)

## 9. Test strategy

For the flag, add "503 when `x402_enabled` is false" to `apps/web/test/x402.test.ts`. Limits as in 04 §9. The key boundary as in 05 §9. Before the audit, confirm the 29 LiteSVM tests pass on v1.3 (CI).

## 10. Open questions

- The KMS backend and its cost (02 §10)
- The treasury cap values
- Who audits, and when
- The legal question (D-05) remains open. As recorded in `docs/legal/2026-10-13-owner-decision.md`, the owner decided to move to mainnet without waiting for review. These documents do not change that decision
