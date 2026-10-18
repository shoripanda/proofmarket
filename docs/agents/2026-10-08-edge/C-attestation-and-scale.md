# Owner C: attesting an agent's claim (§5) and a sensory scale (§4)

Branch: `feat/attestation-and-scale`. Worktree: `~/proofmarket-c`. Uses `verification_requests.attestation` from migration 0023.

## What to build

### Sensory scale (§4)
1. Add `{ type: "scale", key, label, min: 1, max: 5|10, labels: [low end, high end] (20 characters each), required }` to `FormFieldSchema` in `packages/core/src/schemas/api.ts`. The form in `AnswerSchemaSpec` stays as is
2. `packages/core/src/task/answers.ts`: a scale answer is an integer within `min..max` (one line in the form branch of `normalizeAnswer`). In `validateAnswerSchema`, `max` may only be 5 or 10
3. `FormFieldView` and `answerFormat` ("answer on a scale") in `apps/web/lib/answers.ts`. In the form branch of the capture screen (`claims/[id]/capture/page.tsx`), a scale input: `max` round buttons in a row with `labels` at both ends. Text only at the ends
4. Aggregation: in `buildResult` in `apps/web/lib/services/views.ts`, when there are 3 or more valid form submissions, compute `{ median, min, max, n }` per numeric and scale field and return them in `result.aggregate[key]` (add an optional `aggregate` to `VerificationResultSchema`. Do **not** add it to `result_hash`'s excluded fields, i.e. it is hashed; do not touch `RESULT_HASH_EXCLUDED_FIELDS` in `bundle.ts`). For an even count the median is the lower one (stays an integer)
5. Samples: one sentence about scale in the `answer_schema` description on `/developers`, and after the batch section a request "three people measure a shop's atmosphere" (four scales: smell, noise, cleanliness, brightness; `assurance: { level: "high" }`; with `acceptance_criteria`), in Japanese and English

### Attesting an agent's claim (§5)
1. Add an optional `attestation: { subject: z.literal("agent_action"), description: string 1–200 }` to `CreateVerificationRequestSchema`. Store it in the `attestation` column in `requester-service`. Return `attestation` in `GET` and in the worker list, detail and claim detail (add to the schemas)
2. Worker screens: above the question on the request detail and capture screens, "What to check: an AI agent says '{description}'. Please go and see whether it is true" (an amber band, same look as the acceptance criteria; Japanese and English)
3. Proof page `/r/[id]`: when `attestation` is present, the heading becomes "A person confirmed that {description} was done" (Japanese equivalent alongside). Also return `attestation` in the public result `GET /v1/public/verifications/{id}` (the requester wrote the text, so it may be public). Branch in `proof-text.ts`
4. One sentence in the MCP `REQUEST_TOOL` description: "with attestation, an agent can have a person check something it did (delivered, installed, cleaned) and receive it as proof"

## Tests
- In `packages/core/test/answers.test.ts`: scale valid, out of range, and rejection of max 7
- In `apps/web/test/requester-api.test.ts`: attestation round trip and rejection at 201 characters
- Aggregation in `views`: a new `apps/web/test/aggregate.test.ts` that inserts 3 form submissions directly into the DB and checks `aggregate` from `buildResult` (follow how `worker-flow.test.ts` builds things)

## Done when
The wording changes from request → worker screen → proof page. The median of three people's scales is returned.
