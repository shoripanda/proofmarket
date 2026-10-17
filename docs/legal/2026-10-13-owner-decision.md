# The owner's decision on moving to mainnet (2026-10-13)

This is the document `LEGAL_SIGNOFF` points to. The start-up gate (`apps/web/lib/cluster.ts`, spec 15 §4.1) requires "the location of a document recording the outcome of legal review", but what is written here is not a lawyer's conclusion. It is **the owner's decision to switch without waiting for that review**. This is stated first so no reader mistakes one for the other.

## What was decided

- On 2026-10-13 the owner (Hiroki Hashimoto) decided to switch ProofMarket's settlement to real USDC and SOL on Solana mainnet before receiving a lawyer's review of its treatment under Japan's Payment Services Act (`specs/proofmarket/legal-checklist.md` §1, §3, §7; open item D-05).
- Three options were presented: (1) a reviewed document exists, (2) consult a lawyer now and wait for the conclusion, (3) switch without waiting. The owner chose (3).
- The legal responsibility arising from this decision rests with the owner personally. As the operator information page (`/legal/operator`) says, no company has been incorporated.

## Issues that remain open (from legal-checklist.md)

| No. | Issue | How it is built today |
|---|---|---|
| D-05 | Whether requesters' prepaid balances, and the operator's key moving rewards placed in escrow, amount to a "funds transfer business" or "prepaid payment instrument" under the Payment Services Act | Balances are a ledger in the DB; rewards are put into the program's vault by the operator key and paid to the worker after finalization. The operator holds the funds |
| §1 | Whether witnesses (workers) can be treated as independent contractors | Paid per task, no direction or supervision. The contract is a draft at `/legal/worker-terms` |
| §7 | Withholding tax and payment records for witnesses | Not handled. Yen payouts have not started |

## Safeguards taken instead

These do not replace legal review, but limit the damage. They take effect with the switch:

1. Cap the amount kept in the treasury (the operator's wallet) and move the excess to the admin wallet (spec 15 §4.2, §6)
2. There is no cap on request amounts (PR #14, 2026-10-09). Only prepaid balances can move, and mainnet hands out no test balances, so only what a requester deposited themselves can move
3. Mainnet hands out no test balances (15 §4.5). Balances are only what requesters deposit themselves
4. The operator reviews the diff of program v1.2 and records the result in `docs/security/program-review-2026-10-13.md`. There has been no third-party audit
5. Once a lawyer's review is obtained, replace this document with the review's outcome and update `LEGAL_SIGNOFF`

## Record

- How the decision was reached is in a Claude Code conversation log (session_01HKnNetBup2CiDWoVXHYw62, 2026-10-13). This document writes up that decision on the operator's behalf.
