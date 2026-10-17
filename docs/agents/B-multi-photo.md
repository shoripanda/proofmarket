# Owner B: up to 4 evidence photos

Branch: `feat/multi-photo` / worktree: `../Solana-idea-b` / DB migration number: 0020 (only if needed)

## Why
Today one submission carries one photo. Requests that can only be confirmed with several photos, such as "the shop front and the price tag" or "the book's cover and a text page", are not supported. The AI content check (01 §4.16–4.17) also judges better with more photos.

## What to build
1. **API**: `evidence` in `SubmitEvidenceRequestSchema` becomes 1–4 photos, one upload per photo. All must belong to the same claim and the same challenge. The upload-creation endpoint allows up to 4 per challenge.
2. **Server** (`apps/web/lib/services/evidence-service.ts`)
   - Validate every upload (claim, challenge, PENDING).
   - Check format, reuse and near-duplicates per photo. If any one fails, the whole submission fails with that reason.
   - Create an `evidence_objects` row and a thumbnail per photo. Put them all in the evidence bundle's `evidence_sha256` (already an array).
   - The requester's photo URLs (`GET /v1/verifications/{id}/evidence`) return all of them.
3. **AI content check**
   - In-server check (`lib/adapters/claude-reviewer.ts`): change `ReviewInput.image` to `images: Buffer[]` and pass all of them to Claude.
   - External check (`listPendingReviews`): change `image_url` to an `image_urls` array.
   - `scripts/review-runner.ts`: download all of them and list every path in the prompt. Keep `--try` working with a single photo.
   - **Note**: review-runner runs against production every 2 minutes on the owner's Mac. To avoid a period where server and script disagree, the server keeps returning the old field (`image_url`) alongside for now.
4. **Worker capture screen** (`apps/web/app/(worker)/claims/[id]/capture/page.tsx`): allow up to 4 shots, with thumbnails, deleting one at a time, and "take another". On send, upload all of them and then submit. Keep the (Japanese) copy short and natural.
5. **Specs**: add "4.18 Multiple photos (2026-10-04)" to `01-requirements-definition.md`, and align the description of checks in chapter 07.

## Do not touch
- The verdict rules themselves (majority, handling of text).
- The production DB, Vercel, and review-runner's launchd setup (the script's code may change; the owner's first session reinstalls launchd after the merge).

## Done when
- Tests (add a way to send several photos to `witness` in `test/support/worker.ts`): 2 photos pass / one reused photo fails / the checker (fake reviewer) receives every photo / the external check list shows every URL. All existing tests pass.
- The README's "Finishing" is satisfied and the PR is merged.
