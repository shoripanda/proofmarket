# Owner F: optimistic verification (design §3)

Branch: `feat/optimistic`. Worktree: `~/proofmarket-f`. Uses `challenge_minutes`, `provisional_at`, `verification_challenges` and `payout_adjustments` from migration 0023. Do not touch the program. Implement items 1–5 of design §3 **exactly**. If you want to change how money flows, write it in STATUS.md and stop.

## What to build

1. **Requests**: add `{ level: "optimistic", challenge_minutes: 10–120 (default 30) }` to `AssuranceInputSchema`. Normalized, it is `required_witnesses: 1, quorum: 1, challenge_minutes`. Store `challengeMinutes` in `requester-service`; the balance reservation is `bounty × 1` (the bond is paid by whoever challenges). `levelOf` returns `"optimistic"` when `challenge_minutes` is present
2. **Provisional result**: on the first VALID submission, `task-engine` does **not** fire `QUORUM_READY` (when `challengeMinutes` is non-null and `provisionalAt` is null) and writes `provisionalAt = now`. When `provisionalAt` is set and there is no result, `views.buildVerificationView` returns a provisional `result`: computed from the VALID submissions exactly as `buildResult` does, with `provisional: true` and `challenge: { until, state: "open" | "challenged" | "upheld" | "overturned" }` (add optional fields to the schema, and **add** `provisional` and `challenge` to `result_hash`'s excluded fields: `RESULT_HASH_EXCLUDED_FIELDS` in `bundle.ts`). Add the webhook `verification.provisional` to `WEBHOOK_EVENTS` and send it
3. **Challenge**: `POST /v1/verifications/{id}/challenge` (requester auth, Idempotency-Key required). Conditions: within `challengeMinutes` of `provisionalAt`, and no row yet in `verification_challenges`. Reserve a bond of `bounty × 2` from the caller's balance by the same mechanism as `RESERVE` (`requester_ledger`, with `verification_id` the challenged request). Create a re-check the same way as `disputeVerification` (`assurance: standard`, 60-minute deadline, original ID in `recheckOf`), insert a row in `verification_challenges`, and send the webhook `verification.challenged`. New `apps/web/lib/services/challenge-service.ts`
4. **Window expiry**: in the tick in `jobs.ts` (the existing periodic job), fire `QUORUM_READY` for requests with `provisionalAt + challengeMinutes < now` and no challenge, leading to normal finalization
5. **When the re-check finalizes** (after finalization in `verification-service`, when `recheckOf` is set and the original has an OPEN challenge):
   - Match (`matches_original`, using the existing calculation) → challenge `UPHELD`. Fire `QUORUM_READY` on the original request to reach VERIFIED. Deduct the re-check's cost (`bounty × 2`) from the bond and record the rest (nothing if 0) in `payout_adjustments` for the original worker
   - Mismatch → challenge `OVERTURNED`. Reject the original request as if `CONSENSUS_FAILED`, with the new `OUTCOME_REASONS` value `CHALLENGED`. On chain it is `NoConsensus` with the original worker as recipient (`settlement-jobs` takes the same path as existing REJECTED). The re-check's cost is taken from the requester's balance (`RESERVE`) and the bond is returned in full
   - Update `verification_challenges.resolved_at` and `state`
6. **API, MCP, docs**: `result.challenge` in `GET`, `openapi`, one sentence in MCP's `REQUEST_TOOL` ("assurance.level: optimistic gives a provisional answer in minutes, with a challenge window"); do **not** create a new tool (challenges are REST only). A section for `POST /v1/verifications/{id}/challenge` in 05 §2. A "provisional finalization" paragraph in 03 §2 (stating that no state is added; it is expressed by `provisional_at`)
7. **Proof page**: when `challenge` is present, "One person checked this. For {n} minutes anyone could challenge it (no one did / it was challenged and two people re-checked)", with an hourglass line drawing

## Tests
`apps/web/test/optimistic.test.ts` (modelled on `dispute.test.ts` and `worker-flow.test.ts`): no challenge → advance the clock and tick → VERIFIED. Challenge → re-check → match → UPHELD and `payout_adjustments`. Mismatch → OVERTURNED, reason `CHALLENGED`, bond returned. A challenge outside the window is 409.

## Done when
The three paths above pass in tests, and the ledger rows match the design's table.
