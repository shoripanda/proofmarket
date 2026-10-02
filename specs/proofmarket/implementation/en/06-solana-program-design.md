# 06. Design of the Solana Program and the Settlement Adapter

> English translation. The Japanese version in [`../ja/06-solana-program-design.md`](../ja/06-solana-program-design.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. What Goes On-Chain

Put on-chain only what is valuable for a third party to be able to verify later.

| Put on-chain | Reason |
|---|---|
| The per-task escrow account and the amount locked | Anyone can verify that the reward was actually secured |
| The result (outcome), evidence root, result hash, and finalization time | Proof that the result has not been rewritten afterward |
| The recipients' public keys and payment amounts | Proof that the destinations and amounts of the payment were as decided. They appear in the transfer transaction anyway |

A recipient's public key is the same across tasks, so by looking at the Explorer, tasks that involved the same worker can be linked together. In the MVP, this point is explained to workers and their consent is obtained (Chapter 08, Section 4); in production, the design will change to one in which the platform holds balances and pays out in batches (Chapter 00, G-11).

What is not put on-chain: photos, coordinates, question text, worker IDs, names, and contact details, requester names, and API keys (`onchain-data-model.md` Section 1, REQ-P-002 and REQ-P-003). For the task identifier too, only `task_id_hash = SHA-256("proofmarket:task:v1:" + verification_id)` is stored.

The MVP's verifier is a single platform key, not a decentralized verification. The public result page and the pitch explain it the same way (`onchain-data-model.md` Section 4).

## 2. Keys and Accounts

### 2.1 Key roles

| Key | Where it lives | What it can do |
|---|---|---|
| admin | Only on a local machine (not on Vercel) | Initialize and change the config, upgrade the program |
| operator | Vercel server environment variables | Pay fees, own the treasury, execute funding, payment, and refund |
| verifier | Vercel server environment variables (separate from operator) | Only finalize the result (finalize) |

Separating operator and verifier means that, for payments out of an already-locked vault, neither key alone can move both the destination and the transfer. The verifier fixes the payment destinations, and the operator executes the transfer.

However, the treasury is owned by the operator, so if the operator's key leaks, the funds remaining in the treasury can be moved with that key alone. What the key separation protects is the contents of the vault, not the whole treasury. Operate with disposable Devnet keys and a small treasury, and in production split the treasury onto a separate key (or a multisig).

### 2.2 Accounts

```rust
#[account]
pub struct Config {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub verifier: Pubkey,
    pub bounty_mint: Pubkey,        // Devnet USDC, or our own test mint
    pub treasury: Pubkey,           // ATA of bounty_mint owned by the operator
    pub max_witnesses: u8,          // 5. update_config rejects values above MAX_RECIPIENTS (= 5)
    pub paused: bool,               // if true, initialize_task is rejected
    pub bump: u8,
}
// seeds = [b"config"]

#[account]
pub struct Task {
    pub version: u8,                    // 1
    pub bump: u8,
    pub vault_bump: u8,
    pub task_id_hash: [u8; 32],
    pub requester: Pubkey,              // the source of funds. In the MVP, the treasury's owner (operator)
    pub requester_ref_hash: [u8; 32],   // SHA-256(credential_id). For aggregation per requester
    pub mint: Pubkey,
    pub amount_per_witness: u64,        // smallest unit (10^-6 for USDC)
    pub required_witnesses: u8,
    pub quorum: u8,
    pub deadline: i64,                  // unix seconds
    pub status: TaskStatus,             // Funded | Finalized | Settled | Refunded
    pub outcome: Outcome,               // None | Verified | NoConsensus | InsufficientWitnesses
    pub refund_reason: RefundReason,    // None | Cancelled | Expired
    pub evidence_root: [u8; 32],
    pub result_hash: [u8; 32],
    pub recipient_count: u8,
    pub recipients: [Pubkey; 5],
    pub paid_total: u64,
    pub created_at: i64,
    pub finalized_at: i64,
    pub closed_at: i64,
}
// seeds = [b"task", task_id_hash]

// vault: SPL token account. seeds = [b"vault", task.key()], authority = task PDA
```

Task is about 430 bytes, and its rent-exempt amount is about 0.0043 SOL. It is not closed, so that it remains as a receipt of the result. The vault is closed after payment or refund, and the rent is returned to the operator.

## 3. Instructions

### 3.1 List

| Instruction | Signer | Previous state | Next state | What it does |
|---|---|---|---|---|
| `initialize_config` | admin | (none) | — | Creates the Config |
| `update_config` | admin | — | — | Changes operator, verifier, paused, and max_witnesses (5 or less) |
| `initialize_task` | operator | (none) | Funded | Creates the Task and the vault, and moves `amount × N` from the treasury to the vault |
| `finalize_verification` | verifier | Funded | Finalized | Writes the outcome, evidence root, result hash, and recipients |
| `settle` | operator | Finalized | Settled | Pays each recipient one share, returns the remainder to the treasury, and closes the vault |
| `refund` | operator | Funded | Refunded | Returns the full amount to the treasury and closes the vault |

settle can be called only from Finalized, refund can be called only from Funded, and no instruction moves from Finalized back to Funded. No instruction can advance from Settled or Refunded. With these three points, "exactly one of payment and refund, exactly once" holds on-chain (REQ-S-002, REQ-P-004, `acceptance-criteria.md` A5).

### 3.2 initialize_task

Arguments: `task_id_hash`, `requester_ref_hash`, `amount_per_witness`, `required_witnesses`, `quorum`, `deadline`

Checks:

- `config.paused == false`
- Signer == `config.operator`
- `mint == config.bounty_mint`, `treasury == config.treasury`
- `amount_per_witness > 0`
- `1 ≤ required_witnesses ≤ config.max_witnesses`, `1 ≤ quorum ≤ required_witnesses`
- `deadline > Clock::unix_timestamp`
- Compute `amount_per_witness × required_witnesses` with `checked_mul` (an error if it overflows)
- If the Task PDA already exists, `init` fails. The same request cannot be locked twice

Event: `TaskInitialized { task, task_id_hash, amount_total, deadline }`

### 3.3 finalize_verification

Arguments: `outcome`, `evidence_root`, `result_hash`, `recipients: Vec<Pubkey>`

Checks:

- Signer == `config.verifier`
- `status == Funded`
- `evidence_root` and `result_hash` are not all zeros
- `recipients.len() ≤ required_witnesses`, no duplicates, and does not contain `Pubkey::default()`
- Number of recipients per outcome:
  - `Verified`: `recipients.len() ≥ quorum`
  - `NoConsensus`: `recipients.len() ≥ quorum` (because consensus is evaluated once enough valid submissions are in)
  - `InsufficientWitnesses`: `1 ≤ recipients.len() < quorum`
  - `None` is not allowed

No time limit is placed on finalize (D-11, Chapter 00, G-07). A submission that became valid before the request's deadline can be finalized and paid later, no matter how many hours an RPC outage lasts. The deadline check was already done off-chain at the time the submission was accepted, and refund can be called only when the status is Funded, so a finalized task is never refunded.

Event: `VerificationFinalized { task, outcome, evidence_root, result_hash, recipient_count }`

### 3.4 settle

Accounts: config, task, vault, mint, treasury, operator (signer), token program. Pass the recipients' ATAs in `remaining_accounts`, in the same order as `task.recipients`.

Checks:

- Signer == `config.operator`
- `status == Finalized`
- `remaining_accounts.len() == recipient_count`
- Each account matches `get_associated_token_address(recipients[i], mint)`, and the mint and owner also match
- Total payment `amount_per_witness × recipient_count ≤ vault balance`

Processing: send `amount_per_witness` to each recipient → send the remainder to the treasury → close the vault → write `paid_total`, `closed_at`, and `status = Settled`.

Event: `TaskSettled { task, paid_total, remainder }`

### 3.5 refund

Arguments: `reason` (`Cancelled` | `Expired`)

Checks:

- Signer == `config.operator`
- `status == Funded`
- If `reason == Expired`, `Clock::unix_timestamp > deadline`

Processing: send the vault's full amount to the treasury, close the vault, and set `status = Refunded`.

The operator can refund a Funded task as a cancellation at any time. Not refunding a task that has a valid submission is protected by the off-chain state transitions (Chapter 03, T15) and is not enforced on-chain. This point is disclosed on the public result page as part of the premise that the central verifier is trusted.

Event: `TaskRefunded { task, amount, reason }`

### 3.6 Error codes

`Paused`, `Unauthorized`, `InvalidMint`, `InvalidTreasury`, `InvalidAmount`, `InvalidWitnessConfig`, `DeadlineInPast`, `AmountOverflow`, `InvalidStatus`, `InvalidRoot`, `InvalidRecipients`, `RecipientCountMismatch`, `RecipientAccountMismatch`, `InsufficientVaultBalance`, `NotExpired`

## 4. Building Transactions

| outbox job | Instructions in the transaction | Signers |
|---|---|---|
| `FUND_TASK` | Set priority fee, `initialize_task` | operator |
| `FINALIZE_AND_SETTLE` | Set priority fee, `finalize_verification`, `settle` | verifier, operator |
| `REFUND_TASK` | Set priority fee, `refund` | operator |

If a recipient's ATA does not exist, send a transaction containing only `createAssociatedTokenAccountIdempotent` (paid for by the operator) before `FINALIZE_AND_SETTLE`. This is because putting ATA creation in the same transaction could exceed the transaction size limit when there are 3 or more recipients.

Because finalize and settle are combined into one transaction, either both succeed or both fail. The record of the result (attestation) and the payment signature have the same value, so a single Explorer screen can show both.

## 5. Settlement Adapter (`packages/solana`)

### 5.1 Sending and confirmation

1. Before sending, read the Task account
   - `FUND_TASK`: If it already exists, do not send; record it as confirmed
   - `FINALIZE_AND_SETTLE`: If `Settled`, only record it. If `Finalized`, compare the on-chain outcome, evidence root, result hash, and recipients against the result in the DB, and send settle only if they match. If they do not match, do not send; set the job to DEAD and notify the operator (so that, if the verifier's key leaks and the task is finalized with a different destination, the payment is not made as is). If `Funded`, send both
   - `REFUND_TASK`: If `Refunded`, only record it. If `Finalized` / `Settled`, do not refund and notify the operator
2. Get the latest blockhash, sign the transaction, append the signature to `payment_records.signatures`, and then send it
3. Wait until `finalized` (up to 60 seconds). Once finalized, set the record to `CONFIRMED` and advance the task's state
4. If the blockhash has expired and the transaction cannot be found, go back to step 1. A transaction with the same signature is never counted twice

The reason for waiting for `finalized` rather than `confirmed` is not to leave open the possibility that, after declaring SETTLED, a fork reverses it (`architecture.md` Section 4). The wait on Devnet is expected to be a dozen or so seconds, which fits within the non-functional requirement of 60 seconds.

### 5.2 Startup safety checks

- If the RPC's `getGenesisHash` does not match `SOLANA_EXPECTED_GENESIS_HASH` (Devnet), the Adapter refuses to start (REQ-X-P-105)
- Read the Config at `PROGRAM_ID`, and refuse if `bounty_mint`, `operator`, and `verifier` do not match the keys in the environment variables
- If the operator's SOL drops below 1 SOL, emit a warning log on every tick

### 5.3 Balance bookkeeping

| Point in time | requester_ledger |
|---|---|
| Request creation | RESERVE (−total) |
| settle confirmed | RELEASE (+remainder. If everyone is paid, it is 0, so no entry is written) |
| refund confirmed | REFUND (+total) |
| Cancellation before funding | RELEASE (+total) |

Funds moved into the vault have already left the treasury. On the other hand, amounts that were RESERVEd at creation but not yet locked remain in the treasury. Therefore the following equation should hold.

```text
treasury token balance = Σ ledger balances of all requesters + Σ RESERVE amounts of requests before funding (funding not yet confirmed)
```

Reconcile once an hour inside tick, and warn if they diverge (P1).

## 6. Reward Asset

The default is Circle's Devnet USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, 6 decimal places). Fund the operator's ATA from the faucet (`https://faucet.circle.com`).

If the faucet cannot provide the needed amount, create a test mint with 6 decimal places using `scripts/devnet-setup.ts --own-mint` and switch `bounty_mint` with `update_config`. In this case, the API still accepts `bounty.asset` as `"USDC"`, but shows `"test_asset": true` on the public result page and in the response's `settlement`, so that it is not mistaken for real USDC.

## 7. Deployment Steps

1. Create the admin, operator, and verifier keys (`solana-keygen new`). Keep the key files in `~/.config/proofmarket/`, outside the repository
2. Fund admin and operator with Devnet SOL
3. `anchor build` → `anchor deploy --provider.cluster devnet`. The upgrade authority is admin
4. Commit the generated IDL to `packages/solana/idl/proofmarket.json`
5. Initialize the Config and create the treasury's ATA with `pnpm tsx scripts/devnet-setup.ts`
6. Fund the operator's ATA with Devnet USDC
7. Set `PROGRAM_ID`, `BOUNTY_MINT`, `OPERATOR_SECRET_KEY`, and `VERIFIER_SECRET_KEY` on Vercel
