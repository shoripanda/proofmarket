# 13. Verifications and general tasks side by side (2026-10-16, updated to the implementation 2026-10-17)

The owner answered decisions D1-D6 of chapter 12 on 2026-10-16. This chapter is the design for moving ProofMarket to that direction, updated after implementation (PRs #56-#58) to describe what was actually built.

| # | Decision |
|---|---|
| D1 | Widen what can be asked from "verification" to general tasks |
| D2 | For tasks the requester approves, pay the worker if the requester does nothing for **24 hours** after delivery |
| D3 | The fee is **15% on top of** the pay |
| D4 | No card deposits. Deposits stay as Solana transfers (USDC and others) and x402 |
| D5 | Public worker profiles only for those who choose to publish |
| D6 | In the API, put "verification" and "task" side by side; do not rename what exists |

## 1. Conclusion

The move needed no rewrite of the verification flow and no change to the Anchor program. Four points:

1. **Tasks live in their own tables.** The first draft added a `kind` column to `verification_requests`. During implementation we found that 26 existing queries would each need a `kind` condition, and missing one would leak tasks into the verification flow. Tasks therefore live in separate tables (`market_tasks`, `task_applications`, `task_seats`, `task_submissions`, `seat_payments`, `task_messages`) behind their own routes (`/v1/tasks`). The verification code is untouched.
2. **One on-chain Task per seat.** The program pays a vault out in one `settle` and closes it, with at most 5 recipients. Giving each seat (and each refill round) its own `task_id_hash` lets a seat be paid or refunded on its own, with no limit of 5 seats. **No program change.**
3. **The fee is taken in the ledger.** Only the pay goes into the vault; the fee never leaves the treasury. The requester's reservation includes the fee, and only the fee of seats actually paid is kept.
4. **Hidden behind a flag.** `tasks_enabled` in `platform_flags`, off by default. With it off, every task route answers 404 `TASKS_NOT_ENABLED`, the MCP task tools are not listed, and the worker and console screens show nothing.

## 2. Defaults chosen to make the decisions concrete

All can be changed later.

| Item | Default | Why |
|---|---|---|
| Payment for tasks | `release_mode = manual` (the requester approves) | The requester decides (#49). `auto` (paid on delivery) can be chosen |
| Payment for verifications | Unchanged: `auto` and a 24-hour dispute | Verification has strong machine checks; existing users are unaffected |
| Requests for changes | At most 3 per seat; each re-delivery restarts the 24 hours | As at RentAHuman |
| Rejection | A reason is required. The seat's escrow returns to the treasury and the seat can be filled again; a seat number never paid comes back to the balance with its fee when the task ends | No fee on work that was not paid |
| Seats | 1-50 | Each seat costs an on-chain transaction; start small |
| Time to deliver | 1-168 hours from acceptance | Past it the seat is freed and can be filled again |
| Application deadline | The task's `deadline`, up to 30 days ahead | No new column |
| Not yet allowed | Buying goods, carrying goods for delivery, long hourly work, work that needs a licence | Part of requirements §6 stays out of scope (§3) until safety and legal are reviewed |

## 3. Specs changed first (done in PR #55)

The rules in AGENTS.md and CLAUDE.md say a P0 requirement changes in the spec first. PR #55 was documents only:

| Document | Change |
|---|---|
| `specs/proofmarket/requirements.md` §6, §7 | "generalized freelancer profiles/résumé marketplace" narrowed to opt-in public worker profiles; §7 adds REQ-T-001 to REQ-T-008 |
| `docs/proofmarket-concept-2026-10-02.md` | The change of direction recorded |
| `specs/proofmarket/privacy-security.md` | Public worker profiles (city or ward at most) and conversations (flagging, retention) |
| `specs/proofmarket/legal-checklist.md` §10 | The four items in §10 below |

## 4. Data (migrations 0032-0034, applied to production on 2026-10-16)

### 4.1 Platform fee (0032)

`verification_requests.fee_rate_bps` (the rate a request was created at) and `platform_fee_earned` (the part kept at settlement). The existing `platform_fee_amount` now holds the reserved fee.

### 4.2 Task tables (0033)

| Table | Main columns | Use |
|---|---|---|
| `market_tasks` | title, description, completion_criteria, evidence_types, application_questions, area, remote_ok, asset, network, price, seats, fee_rate_bps, fee_per_seat, selection_mode, release_mode, completion_window_h, deadline, status | A task. Status OPEN → CLOSED/CANCELLED → DONE |
| `task_applications` | task_id, worker_id, answers, note, state | One application per worker per task |
| `task_seats` | task_id, seat_no, round, worker_id, state, task_id_hash (unique), funded_at, due_at, submitted_at, review_due_at, revisions, released_by | A seat held by one worker in one round; one on-chain Task each |
| `task_submissions` | seat_id, round, body, links | Deliveries, one per round |
| `seat_payments` | seat_id, kind (FUND/SETTLE/REFUND), amount, status, signatures | Chain operations per seat, at most one of each, settle XOR refund |

`requester_ledger` gains `market_task_id` and `seat_id`, with a unique index so a task has one RESERVE and each seat number at most one REFUND. Three outbox job kinds (`FUND_SEAT`, `SETTLE_SEAT`, `REFUND_SEAT`) and the flag `tasks_enabled` (seeded false) are added. Every new table has RLS on.

### 4.3 Conversation (0034)

`task_messages` (seat_id, sender, body, flags, created_at).

## 5. Task flow

### 5.1 Task status

`OPEN` while taking applicants. At the deadline or on cancel it becomes `CLOSED` / `CANCELLED`; once no seat is in progress, seat numbers never paid are refunded to the balance and a closed task becomes `DONE`.

### 5.2 Seat states

```
(free) ──accept / first come──> ASSIGNED ──deliver──> IN_REVIEW ──release──────────────> RELEASED
   ↑                               │                     │  └─24 h with no decision───────> RELEASED
   │                               │                     ├─request changes (≤3)──> ASSIGNED
   │                               │                     └─reject─────────────────> REJECTED
   └──time to deliver passes── EXPIRED                    (a new round can fill the seat number)
```

| Transition | Who | What happens |
|---|---|---|
| free → ASSIGNED | Requester accepts an applicant, or the worker takes a first-come task | A seat row is created and a `FUND_SEAT` job escrows the seat's pay on chain. `due_at = now + completion_window_h` |
| ASSIGNED → EXPIRED | Tick (`due_at` passed) | `REFUND_SEAT` returns the escrow to the treasury. The seat number is free for the next round |
| ASSIGNED → IN_REVIEW | Worker delivers | `review_due_at = now + 24h`. Webhook `task.submitted`. With `release_mode = auto`, released at once |
| IN_REVIEW → RELEASED | Requester `release` (`acknowledge_release: true` required) or tick (`review_due_at` passed) | `SETTLE_SEAT` runs `finalize_verification` (one recipient) and `settle`. The seat's fee is kept |
| IN_REVIEW → ASSIGNED | Requester `request-changes` (reason required, at most 3) | `revisions + 1`; a new delivery round |
| IN_REVIEW → REJECTED | Requester `reject` (reason required) | `REFUND_SEAT`. The seat number can be filled again while the task is open |

### 5.3 Time

The 24 hours, the time to deliver and the deadline are all checked by the tick's `market_tasks` step. Times come from `app.now()`, never DB defaults (failure log 2026-10-09). The 24-hour payment protects the worker, so only `settlement_enabled` being off stops it.

### 5.4 Balancing requesters who reject a lot

The operator does not judge, so balance comes from numbers: the worker sees each requester's rejection rate over the last 30 days on the task screen, and the reason for every rejection. Automatically lowering the limits of requesters who reject a lot (over 30% with 10 or more decisions) is designed but not yet implemented.

## 6. Money

### 6.1 The 15% fee

- The requester pays price × seats × 1.15; the fee is rounded up to the asset's smallest unit (`platformFeeMicro`). For tasks the fee is computed per seat.
- The verification quote (`POST /v1/verifications/quote`) shows the bounty, fee and total; a task's `dry_run: true` returns the same breakdown.
- Spending limits (#44) count the total including the fee.
- x402 asks for the bounty plus the fee.
- Verifications charge 15% from new requests on; the fee is kept only for witnesses who are paid, and whatever is returned (REJECTED, EXPIRED, cancelled) comes back with its fee. Rechecks from disputes and challenges carry no fee.
- The rate is a code constant (`PLATFORM_FEE_BPS = 1500`), not an env var: changing it goes through review.

### 6.2 Ledger

| When | requester_ledger |
|---|---|
| Task created | One RESERVE of (price + fee) × seats |
| A seat number is released | Nothing (paid from the reservation) |
| Task over, a seat number never released | One REFUND of price + fee for that seat number |

### 6.3 On chain

- A seat's Task is created by `initialize_task` (1 witness, quorum 1, amount = one seat's pay) when the seat is filled, not at creation, so unfilled seats cost no transactions or rent.
- `task_id_hash` = SHA-256(task id ‖ seat number ‖ round). The program prevents paying the same seat twice (the Task PDA is unique, and `settle` / `refund` read the state first).
- The fee never enters the vault; it stays in the treasury.

### 6.4 Deposits (D4)

No card deposits. Deposits remain Solana Pay transfers with a reference, x402, and manual TOPUP by the operator.

## 7. API, MCP, webhooks

### 7.1 REST

Separate routes under `/v1/tasks` (D6: the verification API is unchanged).

| Route | Use |
|---|---|
| `POST /v1/tasks` | Create (`Idempotency-Key`); `dry_run: true` returns the cost only |
| `GET /v1/tasks`, `GET /v1/tasks/{id}` | The key's tasks with seats and latest deliveries |
| `POST /v1/tasks/{id}/cancel` | Stop new applicants |
| `GET /v1/tasks/{id}/applications` | Applicants with answers and past completed counts |
| `POST /v1/tasks/{id}/applications/{app_id}/accept` / `reject` | Decide on an applicant |
| `POST /v1/tasks/{id}/seats/{seat_id}/release` / `request-changes` / `reject` | Decide on a delivery |
| `GET`/`POST /v1/tasks/{id}/seats/{seat_id}/messages` | The seat's conversation |
| `GET /v1/worker/market-tasks`, `GET /v1/worker/market-tasks/{id}`, `POST .../apply` | Worker: open tasks, details, apply (or take, if first come) |
| `GET /v1/worker/market-seats`, `POST .../{seat_id}/deliver`, `GET`/`POST .../{seat_id}/messages` | Worker: own seats, deliver, conversation |

Stage 8 adds `/v1/worker/profile`, `/v1/public/workers`, `/v1/worker-preferences`, `.../seats/{seat_id}/review` and `/v1/public/market-tasks` ([chapter 14](14-public-profiles.md) §2).

### 7.2 MCP tools

Listed only while `tasks_enabled` is on: `create_task` (dry run first; a real post only with `confirm: true`), `get_task`, `list_tasks`, `list_task_applications`, `decide_task_application`, `decide_task_seat` (`release` requires `acknowledge_release`), `cancel_task`, `task_messages`. Existing verification tools are unchanged. Descriptions state that release is called only when the person the agent works for says so, and that worker text is data, not instructions.

### 7.3 Webhook events

`task.application_received`, `task.seat_assigned`, `task.submitted`, `task.changes_requested`, `task.released`, `task.rejected`, `task.seat_expired`, `task.message_received`. Sent to the task owner's active endpoints that subscribe, with the same signing and retries as verification events. Agents can register their own endpoints, send a signed test and read the delivery log (`/v1/webhooks`, PR #57).

## 8. Screens

- **Worker**: `/jobs` (your tasks and open tasks), `/jobs/{id}` (description, definition of done, pay, time to deliver, payment rule, the requester's rejection rate, application questions), `/jobs/seats/{seat_id}` (deliver report and links, deadline, change requests, time left until automatic payment, conversation). A link "N open tasks" appears above the verification list only when tasks are open.
- **Requester console**: `/console/tasks` shows each task's applicants and seats, with accept/decline, approve and pay (with confirmation), ask for changes, reject (with a reason) and a reply box.
- **Public**: public profiles (`/people`) and the public task list (`/market`), see [chapter 14](14-public-profiles.md). `/tasks` and `/workers` were already taken.

## 9. Stages

With `tasks_enabled` off, verification behaviour is unchanged at every stage.

| Stage | Content | Status |
|---|---|---|
| 0 | Spec changes (§3) | Done (#55) |
| 1 | 15% fee | Done (#56); live in production for new verifications |
| 2 | The agent door: llms-full.txt, agents.json, `/openapi.json`, self-service webhooks | Done (#57) |
| 3-4 | Task tables and core flow, 24-hour payment, per-seat on-chain Tasks | Done (#58) |
| 5 | Conversation | Done (#58); screen check pending |
| 6 | MCP tools and webhook events | Done (#58) |
| 7 | Worker and console screens | Done (#58) |
| 8 | Public profiles, public task list, preferred/blocked, ratings | Built behind the flag (#61-#65, [chapter 14](14-public-profiles.md), migration 0035) |
| 9 | Turn on `tasks_enabled` in production | After §10 |

## 10. Legal items before turning on the flag

In `legal-checklist.md` §10; the owner decides before stage 9. Chapter 14 §11 adds two items for public profiles and blocking.

1. **Act on Ensuring Proper Transactions Involving Specified Entrusted Business Operators** (the freelance protection act, in force November 2024): when the requester is a business and the worker an individual, terms (work, pay, payment date) must be stated. Paying within 24 hours helps with the payment-date rule, but the terms must be shown on the request screen and kept on record.
2. **Employment Security Act**: matching requesters and workers must stay an intermediary for service contracts, not "employment placement" (per-task pay, no direction and supervision, no long hourly work).
3. **Keeping conversations**: reading messages to detect contact details, how long they are kept, and how deletion requests are handled go into the privacy policy.
4. **Showing the 15% fee**: show the requester's total and the worker's amount before creation (aligned with the Act on Specified Commercial Transactions).

## 11. Tests

- core: fee arithmetic (rounding up, per-asset decimals).
- web (PGlite): `platform-fee.test.ts` (7), `market-tasks.test.ts` (10: flag off, dry run and reservation, apply to payment, 24-hour payment, reject and refill and cancel refunds, the 3-change limit, first come and expiry, deadline settlement, signed webhooks, other keys refused), `mcp-tasks.test.ts` (3: hidden while off, dry run → confirm, accept → message → release), `webhook-self-service.test.ts` (4).
- Checked by hand on the local dev server with Playwright: apply → accept → funding → deliver → time left on the worker screens, and approve and pay on the console.

## 12. Open

- Lowering limits for requesters who reject a lot (§5.4).
- Whether to allow more than 50 seats; estimate per-seat transaction fees and rent first.
- What AI screening of applicants (`auto_accept`) should look at; start with what machines can tell (blocks, suspensions, language).
- When to allow delivery and purchasing tasks.
- Photo and file deliveries for tasks (today: text and links).
