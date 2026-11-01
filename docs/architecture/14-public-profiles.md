# 14. Public worker profiles, preferences, ratings and the public task list (stage 8)

Written 2026-10-24. This is stage 8 of [chapter 13](13-marketplace-migration.md) §9. It follows decision D5 ("public worker profiles only for those who choose to publish") and REQ-T-007, and the privacy rule in `specs/proofmarket/privacy-security.md` ("Public worker profiles").

Everything here sits behind `tasks_enabled` like the rest of chapter 13. With the flag off, every new route answers 404 `TASKS_NOT_ENABLED`, the new MCP tools are not listed and the new pages return 404.

## 1. Conclusion

Four features, one migration (0035), no program change:

1. **Public profile (opt-in).** A worker can publish a display name, a city or ward, skills and languages. ProofMarket adds the completed count and the rating. Off by default; turning it off hides the profile at once.
2. **Preferred and blocked.** A requester (principal) can mark a worker as preferred or blocked. A task can be limited to preferred workers. A blocked worker never sees that requester's tasks.
3. **Ratings.** After a seat is released, the requester can rate it once, 1-5, with an optional comment that only the worker sees.
4. **Public task list.** Open tasks (area only, no requester identity) on a public page and a public API, so workers and search engines can find them.

## 2. Names and routes

`/workers` (the page for people who want to join as workers) and `/tasks` (the worker's verification list) are already taken, so the new public pages use other paths. The API keeps D6: new names, nothing existing renamed.

| Feature | Page (ja / en) | API |
|---|---|---|
| Profile list | `/people`, `/en/people` | `GET /v1/public/workers` |
| One profile | `/people/{public_id}` | `GET /v1/public/workers/{public_id}` |
| Edit own profile (worker) | `/profile` (worker app) | `GET`/`PUT /v1/worker/profile` |
| Preferences (requester) | `/console/workers`, buttons in `/console/tasks` | `GET /v1/worker-preferences`, `POST /v1/worker-preferences` with `kind` `prefer` / `block` / `clear` |
| Rating (requester) | On the seat in `/console/tasks` | `POST /v1/tasks/{id}/seats/{seat_id}/review` |
| Public task list | `/market`, `/market/{id}` | `GET /v1/public/market-tasks`, `GET /v1/public/market-tasks/{id}` |

## 3. Public profile

### 3.1 What is shown

| Field | Who writes it | Rule |
|---|---|---|
| `display_name` | Worker | 2-40 characters. Not required to be a real name |
| `city` | Worker | Optional. At most 40 characters, no digits (so no street numbers), meant for a city or ward such as "Shibuya-ku". Never a station or coordinates |
| `skills` | Worker | Up to 10 tags, 1-30 characters each |
| `languages` | Worker | Up to 5, from a fixed list of language codes |
| `completed` | ProofMarket | Released task seats plus settled verifications, computed when read |
| `rating` | ProofMarket | Average of ratings, one decimal, with the count. Shown only from 3 ratings so that one requester's rating cannot be singled out |
| `member_since` | ProofMarket | Month only |

No photo for now (it would need storage, size limits and review of faces). No free-text bio for now; skills and languages carry the content.

Display name, city and skills are checked with the same patterns as conversations (contact details, payment outside ProofMarket). For a profile the check **refuses** the text instead of flagging it, because profiles are public.

### 3.2 Identity

A profile has its own random `public_id` (`pw_` + 20 characters). It is not the worker id and not the HMAC `worker_ref` that requesters already see, so a public profile cannot be joined with past verification results by id. A requester who accepted a worker whose profile is public sees the `public_id` in the application; a worker who keeps the profile off stays pseudonymous, as before.

### 3.3 Turning it on and off

- Default off. The worker turns it on in `/profile` after reading what will be shown, with a preview.
- A second switch, `indexable` (default off), decides whether search engines may index the page and whether it goes into `sitemap.xml`. Off means `noindex` and no sitemap entry.
- Turning the profile off hides it from lists, pages and the API at once (404). The row is kept so the worker can turn it back on; deleting the account deletes it.
- A suspended worker's profile is hidden.
- Only a worker session can edit a profile. Requester API keys and OAuth tokens cannot (lesson from RentAHuman, 12 §4).

### 3.4 Search

`GET /v1/public/workers?skill=&city=&lang=&cursor=` returns public profiles, newest activity first, 20 per page. Matching is exact on a normalised skill tag and language code, prefix on city. Rate limited like other public routes.

## 4. Preferred and blocked

Per requester principal (not per API key), so all keys of one requester share them.

| | Effect |
|---|---|
| `prefer` | The worker is marked and sorted first in the applicant list. Tasks created with `audience: "preferred"` are shown only to preferred workers |
| `block` | The worker does not see the requester's tasks in lists, gets 404 for them, and cannot apply or take a first-come seat. Seats already held are not affected (blocking does not take pay away from work in progress) |

- The worker is never told they are preferred or blocked.
- A requester can mark any worker it has met (an applicant or a seat holder, by `task_id` + `worker_ref`) or any public profile (by `public_id`). Each mark gets a `pref_ref` (an HMAC of principal and worker), which lists and clears it without exposing any worker id; a worker without a public profile is listed by `pref_ref` alone.
- Applicants carry `preferred` and, when the worker keeps a public profile, `public_id`.
- The worker's view of a task does not include `audience`, so a worker cannot tell they are preferred.
- `market_tasks` gains `audience` (`everyone` default, or `preferred`). A preferred-only task with no preferred worker is refused at creation (`VALIDATION_FAILED`, `no_preferred_workers`), so a task is never posted to nobody.
- Preferred-only tasks are not in the public task list.

## 5. Ratings

- Only for a `RELEASED` seat, by the task's requester, once, within 14 days of release. Not editable (a new rating would invite pressure on workers).
- `rating` 1-5, `comment` 0-500 characters. The comment is shown to the worker on the seat screen and never publicly. Rejected seats are not rated; rejections already carry a reason and count in the rejection rate (13 §5.4).
- The public profile shows only the average and the count (from 3 ratings).
- The comment is passed through the same contact pattern check as messages and flagged, not refused.

## 6. Public task list

- Shows `OPEN` tasks with `audience = everyone` before their deadline: title, description, definition of done, evidence wanted, area or "remote", pay per seat and asset, seats left, deadline, time to deliver, payment rule (`auto` / `manual`), and the requester's rejection rate and decided count (the same numbers the worker screen shows).
- Never shows the requester's name, key or principal id, application questions' answers, seats or deliveries.
- Applying still needs a worker login: the page links to `/jobs/{id}`.
- `/market` and its entries are indexable (tasks are written to be public). Closed tasks return 410 so search engines drop them.

## 7. Data (migration 0035)

| Table / column | Columns | Notes |
|---|---|---|
| `worker_profiles` | worker_id (pk), public_id (unique), public, indexable, display_name, city, skills text[], languages text[], updated_at | RLS on. Check constraints mirror §3.1 |
| `requester_worker_prefs` | principal_id, worker_id, kind (`prefer`/`block`), created_at | Primary key (principal_id, worker_id); one kind at a time. RLS on |
| `seat_reviews` | seat_id (pk), principal_id, worker_id, rating smallint, comment, flags, created_at | `rating between 1 and 5`. RLS on |
| `market_tasks.audience` | text not null default `everyone` | Check `everyone` / `preferred` |

Indexes: `worker_profiles (public) where public`, `seat_reviews (worker_id)`, `requester_worker_prefs (worker_id, kind)` for the block filter on worker lists.

## 8. MCP tools and webhooks

Listed only while `tasks_enabled` is on:

- `search_workers` (skill, city, language) and `get_worker_profile`
- `set_worker_preference` (`prefer`, `block` or `clear`; with no arguments it lists the marks)
- `rate_task_seat` (descriptions say: only when the person the agent works for gives the rating)

`create_task` gains `audience`. No new webhook events. Profile text is passed to agents marked as data, never as instructions, like messages.

## 9. Screens

- **Worker**: `/profile` with the two switches, the fields, a preview of the public page and the ratings received with their comments. A link to it from `/jobs`.
- **Requester console**: `/console/workers` lists preferred and blocked workers with a way to clear them. Applicants and seats in `/console/tasks` get "prefer", "block" and, on released seats, a rating form.
- **Public**: `/people`, `/people/{public_id}`, `/market`, `/market/{id}`, each with `/en`. Header links appear only while the flag is on.

## 10. Order of work

Each step is one PR, stacked on the previous one; the flag stays off.

| PR | Content |
|---|---|
| 8-0 | This chapter, the legal items below, links from 13 §9 |
| 8-1 | Migration 0035 (all three tables and `audience`), `/v1/worker/profile`, `/profile`, `/v1/public/workers`, `/people`, sitemap — done 2026-10-24 |
| 8-2 | Preferences, `audience`, block filter on worker lists and apply, `/console/workers`, `set_worker_preference` — done 2026-10-24 |
| 8-3 | Ratings: API, console form, worker screen, average on profiles |
| 8-4 | Public task list: API, `/market`, sitemap, MCP tools |

## 11. Legal and privacy items (added to the list in 13 §10)

5. **Public profiles are personal data the worker chooses to publish.** The privacy notice must say what is shown, that it is off by default, how to turn it off, and that search indexing is a separate choice. The worker consent version for `privacy_notice` is bumped when this goes live.
6. **Blocking** is a requester's private choice and is not disclosed to the worker; the terms for requesters should say requesters may choose whom to work with, and the terms for workers that tasks shown to them can differ.

## 12. Tests

- Profile: off by default; refusing contact text and digits in `city`; hidden when off, suspended or with the flag off; requester keys cannot edit; `public_id` differs from `worker_ref`.
- Preferences: blocked worker cannot see, open or apply to the requester's tasks, but keeps a seat already held; preferred-only task visible only to preferred workers; creation refused with no preferred workers.
- Ratings: only on `RELEASED`, once, within 14 days, only by the owner; average hidden below 3 ratings.
- Public task list: only open, `everyone`, before deadline; no requester identity in the JSON; 410 for closed tasks.

## 13. Open

- Photos on profiles.
- Whether workers should rate requesters too (today the rejection rate plays that part).
- Whether `prefer` should also send a push to preferred workers when a preferred-only task is posted.
