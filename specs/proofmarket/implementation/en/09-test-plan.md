# 09. Test Plan

> English translation. The Japanese version in [`../ja/09-test-plan.md`](../ja/09-test-plan.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. Test Layers

| Layer | Target | Tools | Run in CI |
|---|---|---|---|
| U: Unit | `packages/core` (state transitions, checks, consensus, normalization, policy, error format) | Vitest | Yes |
| P: Program | All instructions and invariants of `programs/proofmarket` | LiteSVM (Rust) | Yes |
| I: Integration | API → DB → Storage → Settlement Adapter → local verifier | Vitest, Docker PostgreSQL, `solana-test-validator`, a test bucket for Storage | Yes (including validator startup) |
| E: End-to-end UI | From worker registration to submission | Playwright (mobile viewport, location and camera faked) | P1 |
| F: Field | Real workers, real shops, Devnet | Procedure document and record sheet | No |
| R: Demo run-through | The demo procedure for the submission | Stopwatch | No |

The faked location and camera in layer E are used only for testing. Successful examples shown as evidence in demos or real use are limited to real ones from layer F (`acceptance-criteria.md` A2 "no synthetic/AI-generated evidence").

## 2. Required Negative Tests

The 10 items in Section D of `acceptance-criteria.md` and their corresponding tests.

| # | Content | Test ID | Layer | Expected result |
|---|---|---|---|---|
| D1 | Create twice with the same Idempotency-Key | I-IDEM-01, I-IDEM-03 | I | The second call returns the same response and `Idempotent-Replayed: true`. There is one request and one balance reservation (I-IDEM-01, PR-04). There is also one Task PDA (I-IDEM-03, PR-11) |
| D1' | Create with the same key but a changed body | I-IDEM-02 | I | 409 `IDEMPOTENCY_KEY_CONFLICT` |
| D2 | Submit the same photo to a different task | I-EVD-01 | I | The second submission gets `EVIDENCE_REPLAYED`, and the claim is REJECTED |
| D3 | Expired nonce | I-EVD-02a, I-EVD-02b | I | If it expires when obtaining the upload URL: 410 `NONCE_EXPIRED` (no submission is recorded). If it expires after the URL was obtained and the worker submits: INVALID with `EVIDENCE_STALE` |
| D3' | Already-used nonce | I-EVD-03 | I | 409 `NONCE_USED` |
| D4 | Outside the geofence | U-CHK-03, I-EVD-04 | U / I | `EVIDENCE_OUTSIDE_GEOFENCE`, retry allowed |
| D5 | Expired task | I-EVD-05 | I | 410 `TASK_EXPIRED` |
| D6 | Unsupported file | I-EVD-06 | I | `MEDIA_TYPE_UNSUPPORTED` / `MEDIA_DECODE_FAILED` for PNG, text, and a corrupt JPEG; `MEDIA_TOO_LARGE` at 9 MiB |
| D7 | Prohibited request content | U-POL-01 to 13, I-CRT-05 and 06 | U / I | 422 `TASK_POLICY_VIOLATION` with `rule_id` per rule. A location outside the allowlist gets 400 `LOCATION_NOT_ALLOWLISTED` |
| D8 | settle twice | P-SET-02, I-SET-02 | P / I | The second call gets `InvalidStatus`. The Adapter reads the state and does not send |
| D9 | refund after settle | P-REF-03, I-SET-03 | P / I | On-chain: `InvalidStatus`. In the DB, a REFUND row cannot be created because of `settle_xor_refund` |
| D10 | settle after refund | P-SET-04, I-SET-04 | P / I | Same as above (reverse direction) |

## 3. Main Tests by Layer

### 3.1 Unit (U)

- U-SM-ALL: Across all (state, event) combinations, only those in the transition table of Chapter 03 succeed (REQ-S-001, REQ-N-004)
- U-SM-CAN: Cancellation conditions (rejection when there is an ACTIVE claim or a valid submission)
- U-CHK-01 to 08: Boundary values for each check (distance exactly equal to the radius, accuracy exactly 100m, freshness exactly at the limit, file size exactly at the limit)
- U-CON-01 to 08: Consensus (1/1, 2/2 agreeing, 2/3 agreeing, 2/3 split, UNCLEAR as the majority, a tie, valid below quorum)
- U-JCS-01: A fixed bundle produces a fixed evidence root. Reordering the keys gives the same result
- U-JCS-02: The input of the result hash does not include `result_hash`, `consensus_ratio`, `attestation`, `settlement`, or `verified_at`. Recomputing from the API response gives the same value
- U-POL-01 to 13: For each rule in Chapter 08 Section 3, banned examples in Japanese and English are rejected, and close but harmless examples (such as "Is it open?" (「営業中ですか」)) pass
- U-ERR-01: Every error code has `code`, `message`, and `retryable`, and contains no stack trace (REQ-N-001)

### 3.2 Program (P)

| ID | Content |
|---|---|
| P-INIT-01 | Escrow succeeds normally, and the vault balance is `amount × N` |
| P-INIT-02 | A second call with the same `task_id_hash` fails |
| P-INIT-03 | Each of these fails: a mint that is not allowed, 0 amount, N=0, Q>N, a past deadline, `paused`, and a signature from anyone other than the operator |
| P-FIN-01 | Finalizes normally |
| P-FIN-02 | Each of these fails: a signature from anyone other than the verifier, a state other than Funded, duplicate / excess / missing recipients, and an all-zero root |
| P-FIN-03 | Finalization still works long after the deadline as long as the state is Funded (D-11) |
| P-CFG-01 | `update_config` fails when `max_witnesses` is set to 6 or more |
| P-SET-01 | Pays normally, the remainder returns to the treasury, and the vault is closed |
| P-SET-02 | A second settle fails |
| P-SET-03 | Fails with recipient accounts in the wrong order, a different mint, or a different owner |
| P-SET-04 | settle after Refunded fails |
| P-REF-01 | A refund treated as a cancellation succeeds |
| P-REF-02 | An expiry refund before the deadline fails |
| P-REF-03 | refund after Finalized or Settled fails |
| P-OVF-01 | Fails with a value where `amount × N` overflows |

### 3.3 Integration (I)

- I-FLOW-01: Create → fund escrow → claim → challenge → upload → submit → VERIFIED → SETTLED passes, and a Devnet-equivalent transaction signature is included in the result
- I-FLOW-02: With 2-of-2 (P1), the two agree and the task becomes VERIFIED, with payment to both
- I-FLOW-03: With 2-of-2 (P1), the two disagree and the task becomes REJECTED, with payment to both, and the lifecycle stays REJECTED
- I-FLOW-04: Nobody shows up, and the task goes EXPIRED → REFUNDED and the balance is restored
- I-RACE-01: Two people claim the last remaining slot at the same time, and only one succeeds
- I-RACE-02: Even if two submissions arrive at the same time for a 1-of-1 task, only one is valid
- I-RPC-01: The task becomes VERIFIED while the RPC is stopped, and settlement is PENDING → SETTLED after recovery. SETTLED is never shown while the RPC is stopped
- I-RPC-02: Even if the process crashes after sending and before confirmation, a rerun does not pay twice
- I-LIM-01: Per-task cap, daily cap, insufficient balance, and rate limit
- I-RACE-03: Create 10 tasks at the same time from an API key with a nearly exhausted balance, and the total reservation does not exceed the balance
- I-CRT-05: A request containing a banned word gets 422 from the API, and neither a request nor a reservation is created
- I-CRT-06: A request at a location 31 m from an allowlisted point gets 400 `LOCATION_NOT_ALLOWLISTED`
- I-IDEM-03: Running FUND_TASK twice for the same request leaves one Task PDA, and the second run does not send
- I-FUND-01: If the transaction landed after the escrow confirmation timed out, T16 does not set CANCELLED and proceeds to T01
- I-SET-02: Running FINALIZE_AND_SETTLE twice does not send the second time
- I-SET-03 and 04: Without using the program (assuming an emergency setup), trying to record a refund after payment, or a payment after a refund, in the DB fails on the unique constraint
- I-SET-05: When the on-chain Finalized recipients differ from the DB, the job becomes DEAD without sending settle
- I-OUT-01: A job that crashed while RUNNING is rerun by the tick after its lease expires
- I-PRIV-01: Responses of the requester API and the public API contain no coordinates, worker ID, public key, or photo URL (REQ-PR-002, A4)
- I-WH-01 (P1): The Webhook signature can be verified, and the payment state does not change even if the destination is down

## 4. CI

`.github/workflows/ci.yml` runs the following on every PR. If any of them fails, do not merge.

1. `pnpm lint`, `pnpm typecheck`
2. `pnpm test` (layer U)
3. `anchor build` and `cargo test` (layer P)
4. Integration tests (start PostgreSQL and `solana-test-validator` as services)
5. `gitleaks detect` (including history)
6. After `pnpm build`, confirm that `.next/static` contains no key-like strings (87 to 88 characters of base58, `pm_test_`, `sk-`)

## 5. Field Tests (Layer F)

### 5.1 Procedure

1. The operator picks 3 to 5 public shops in the pilot region and records the shop name, location, and radius (default 80m)
2. Create a request with the demo agent (the requester role is played by someone other than the worker)
3. The worker accepts it on their own smartphone, then photographs and submits on site
4. Write the result, the Explorer transaction, and the elapsed time into the record sheet

### 5.2 Record Sheet Columns

`Date and time`, `verification_id`, `Shop (operator's internal note)`, `requester`, `worker`, `Create→claim (min)`, `Claim→submit (min)`, `Submit→SETTLED (sec)`, `Answer`, `Actual state (visual check)`, `Verification failure reason`, `Explorer`, `Observations`

The numbers in `kpi.md` (median elapsed time, breakdown of rejection reasons, and so on) are taken from this sheet and are not padded by hand.

### 5.3 Runs That Fail on Purpose

- Shoot from 200m away from the shop (outside the geofence)
- Wait 6 minutes after obtaining the nonce (`NONCE_EXPIRED` at upload). Upload the photo, wait 5 minutes, then submit (`EVIDENCE_STALE`)
- Use the same photo in a different task (replay. Use a test file, and do not count the result of this run in the real-use count)

## 6. Mapping to Acceptance Criteria

| Criterion | How to verify |
|---|---|
| A1 requester flow | I-FLOW-01, I-IDEM-01 and 03, layer F |
| A2 human flow | Layer F (real people and photos). Fakes in layer E do not count as successful examples |
| A3 verification | Tests D2 to D6, I-FLOW-01 |
| A4 result | JSON inspection in I-FLOW-01, I-PRIV-01 |
| A5 Solana | All of layer P, I-RPC-01 and 02, I-SET-02 to 05, visual check in the Explorer |
| A6 security | CI items 5 and 6, U-SM-ALL, I-LIM-01, I-RACE-03, D7, D6 |
| A7 demo | Layer R. Within 3 minutes, no manual DB changes, the Explorer link opens |
| B (P1) | I-FLOW-02 and 03, manual check of MCP, I-WH-01, 5 or more layer F runs |
