# 15. Push notifications for general tasks (2026-11-01)

Web Push for verifications has existed since 2026-10-04 (`specs/proofmarket/implementation/en/05-api-design.md` §1, 04 §3.22): a worker subscribes with coarse areas, and a new verification goes to the workers who chose its area, or to everyone when it needs no place. General tasks (chapter 13) had no push at all. Requesters hear about everything through webhooks, but a worker only learnt of a new task, an accepted application, a message or a payment by opening the app. This chapter adds those pushes. Nothing in the subscription, the stored data or the consent changes.

## 1. Rules carried over

- No worker location is used. Areas are the coarse ones the worker picked (`push_subscriptions.areas`).
- The text never contains what the requester wrote: no task title, description, message body or reason. Lock screens are visible to others, and requester text is not reviewed before it goes out. The amount, currency, area name and times are shown.
- Each subscription gets the text in the language its app is shown in (13 §7). English links go to `/en/...`.
- Best effort, sent once. A missed push is still visible in the app. Gone endpoints are deleted and failures counted, as before.
- Nothing is sent while `tasks_enabled` is off, even if a job is already queued.

## 2. A new task

When a general task is created (it opens at once), one push goes to every active subscribed worker who may apply (14 §5):

- A worker the requester blocked gets nothing.
- A preferred-only task (`audience = preferred`) goes only to the requester's preferred workers, with the title "New task from a requester who picked you". This answers the open question in 14 §13.
- A task that can be done anywhere (`remote_ok`, or no area) goes to every subscriber. A task tied to an area goes to workers who chose at least one area. The task's `area` is free text, so it cannot be matched against the coarse areas; a worker who chose none has said they only want work with no place (01 §4.20).

The link is `/jobs/<task_id>`.

## 3. The worker's own seat

Pushed to the seat's worker only, linking to `/jobs/seats/<seat_id>`:

| Event | When | Text |
|---|---|---|
| `assigned` | The requester accepts the worker's application. Not for a first-come claim, which the worker made themselves | "You got the task", with the submission due time |
| `changes_requested` | The requester asks for changes | "The requester asked for changes", with the new due time |
| `rejected` | The requester rejects the submission | "Your submission was not accepted"; the reason is on the task screen |
| `released` | The seat is released (by the requester, the 24-hour rule or auto release), so payment starts | "You are being paid", with the amount and currency |
| `message` | The requester sends a message on the seat | "New message from the requester"; the body is on the task screen |

Seat expiry and cancellation are not pushed: the worker either let the time run out or the seat was never theirs to work on.

## 4. Jobs

All worker pushes use the existing outbox job kind `NOTIFY_WORKERS`, told apart by the payload: `{ verification_id }` (unchanged), `{ market_task_id }` (§2) or `{ seat_id, event }` (§3). A new job kind would need a migration of `outbox_kind_chk`; reusing the kind needs none, so this ships without touching the production database. Dedupe keys are `NOTIFY_WORKERS:task:<id>` and `NOTIFY_WORKERS:seat:<id>:<event>:<ms>`, so repeated events such as messages each go out.

## 5. Also fixed

The verification push said "USDC" whatever the reward currency was. Since 2026-11-01 production accepts USDC, SOL, USDT and PYUSD, so a PYUSD request was announced as "0.5 USDC". The text now uses the request's own currency.

## 6. Tests

`apps/web/test/task-push.test.ts`: area and anywhere tasks, English text and links, blocked and preferred-only, the flag off, each seat event reaching only its worker with no requester text, rejection, and the currency in verification pushes.
