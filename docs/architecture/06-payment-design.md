# 06. Payment design: keep the prepaid balance and x402, add limits and quotes

Written: 2026-10-14 / Authoritative: chapter 15 (mainnet and SOL) and chapter 16 (multi-token and throughput, under review in PRs #39-#42)

## 1. Purpose

Design the payment parts of sections 4.1 and 4.3 of the brief: how requesters pay, how witnesses receive, and how the operator reconciles. The inside of the escrow is chapter 05 and spending brakes are chapter 08; this chapter covers the flow of funds and throughput.

## 2. Current state

Funds flow in three stages, keeping the existing rule that separates "payment" from "escrow of the bounty" (`architecture.md` §6).

```mermaid
flowchart LR
  subgraph in["Deposits (requester → operator)"]
    A1["Manual TOPUP by the operator<br/>issue-api-key / 5 USDC trial from join"]
    A2["Solana Pay deposit<br/>transfer with a reference, detected by the tick"]
    A3["x402<br/>402 → verify, co-sign and send the payment → TOPUP"]
  end
  L[("requester_ledger<br/>TOPUP / RESERVE / RELEASE / REFUND")]
  subgraph esc["Escrow (operator → vault → witnesses)"]
    F["FUND_TASK<br/>treasury → vault"]
    S["FINALIZE_AND_SETTLE<br/>vault → witnesses, rest → treasury"]
    R["REFUND_TASK<br/>vault → treasury"]
  end
  A1 --> L
  A2 --> L
  A3 --> L
  L -->|RESERVE| F
  F --> S
  F --> R
  S -->|RELEASE (difference)| L
  R -->|REFUND| L
```

For Solana Pay, each credential gets an ed25519 reference key that the requester attaches to the transfer. The tick goes through credentials with a reference, 25 at a time, with `getSignaturesForAddress`, and records each finalized transfer as one row in `deposits`. x402 is `POST /v1/x402/verifications`: USDC only, the amount fixed at `bounty.amount × required_witnesses`, and a new API key returned per payment.

Witnesses are paid with a single `settle`: USDC to the witness's ATA (created by the operator if missing), SOL straight to the wallet (wSOL turned back into lamports through the task account, 15 §3.1). The operator pays fees and rent. A platform fee column exists (`platform_fee_amount`, migration 0027), but it is 0 and nothing reads it. Yen payouts are only a registration of interest; none have started.

Throughput became an issue in 16 §2.3: with mainnet's wait for finalized (about 7 seconds on public RPC), today's tick, which runs jobs one at a time, is not expected to fit in 300 seconds. PR #40 added parallelism (6 at a time by default, 60 per run, stop taking new jobs at 200 seconds) and better sending, but there is no production measurement yet.

## 3. Requirements

- Requester spending is bounded by three things: balance, per-request limit and daily limit (limits can be disabled with null)
- The cost is known before paying (the quote in chapter 04)
- The operator can reconcile on-chain payments with DB records daily
- Mainnet throughput is measured and compared with the targets (16 §7.1)

## 4. Proposed design

### 4.1 Where the spending policy lives

In `createVerification`, as in 04 §4.3. Order of checks: policy (type, place, deadline) → per-request limit → daily total → balance, using the existing error codes. x402's preview (try the create before answering 402) goes through the same order, so a request over the limits is refused before payment.

### 4.2 Daily reconciliation

Put the review's item 7 recommendation, "compare `paid_total` in `TaskSettled` with `payment_records`", into the tick's once-a-day step (the same step as retention deletion). For each `payment_records` row that became CONFIRMED the previous day, read the Task account, count whether `paid_total` and `recipients` match the DB, and on a mismatch write a warning log and an `audit_events` row (a new `reconciliation_mismatch`, not `operator_action`). One RPC call per row: 100 rows a day means 100 calls.

### 4.3 Measuring throughput

Once PR #40's parallelism is in, include per-step durations and counts in the tick's return value, and have `/v1/health/ready` check whether the latest tick went over 200 seconds. The targets stay as in 16 §7.1 (funding a batch of 50 within 5 minutes; from final to paid within 2 minutes). Measure during the first week after moving to mainnet and record it in `docs/ops/`. If the targets are missed, call several ticks in parallel from Supabase pg_cron rather than from Vercel (splitting the function's 300-second limit into two likely helps more than raising `JOB_CONCURRENCY`; guess).

### 4.4 What stays

The prepaid balance (D-05), x402 limited to USDC (16 §9), a platform fee of 0, and no yen payouts. None of these move until the legal questions (D-05, `legal-checklist.md` §3 and §7) are settled.

## 5. Rationale

Reconciliation goes into the tick to avoid a new long-running process; once a day fits inside a Vercel function. Throughput goes into `/v1/health/ready` because external monitoring (`uptime.yml`) already checks it every 5 minutes, so no new alert path is needed.

## 6. Alternatives

- Widening x402 to USDT or PYUSD. The `exact` scheme is an SPL token transfer, so it is technically possible, and with PR #41's currency registry switching mints is small. Wait for demand (16 §9)
- Detecting deposits with Helius webhooks (address monitoring). It would cut the tick's `getSignaturesForAddress` calls but adds a webhook receiver and signature verification. Consider once there are over 100 requesters
- Paying witnesses in one daily batch (G-11, P2). It solves witnesses' public keys appearing on Explorer per request, but breaks the escrow's "one request, one transaction" proof. Design separately after mainnet

## 7. Security considerations

As in the table in 08 §1.5, double payment is prevented in three layers. Reconciliation is detection, not prevention, but it finds key abuse (review item 1) or drift between the DB and the chain by the next day. x402 replay protection is the primary key of `x402_payments` (the transaction ID); a row left sending for over 120 seconds may be resent, but its presence on chain is checked first.

## 8. Implementation issues

- Reconciliation reads Task accounts, and for requests settled more than a year ago (365-day retention) the `payment_records` are gone. Limiting it to the previous day avoids the problem
- More checks in `/v1/health/ready` could make `uptime.yml` fail more often. Report throughput warnings in a body field rather than as 503; keep 503 for whether the DB and tick are alive

## 9. Test strategy

For reconciliation, add one case to `apps/web/test/jobs.test.ts` where the fake chain adapter returns a `paid_total` different from the DB and check a warning is raised. Throughput cannot be measured in unit tests; add a procedure to layer F of chapter 09 (existing spec) that funds 50 requests on localnet and records the time.

## 10. Open questions

- The four items in 16 §9 (which currency to open first, trust in issuers, witnesses' account costs, x402 currencies)
- If throughput targets are missed, whether to call several ticks from pg_cron or move to another runtime
- When, and in which currency, to take a platform fee (`docs/pitch/08-revenue-model.md`)
