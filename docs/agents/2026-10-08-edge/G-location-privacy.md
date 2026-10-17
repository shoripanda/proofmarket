# Owner G: rounding locations on public surfaces (PR 7 of design §9)

Branch: `feat/location-privacy`. Worktree: `~/proofmarket-g`. Do not touch the DB (rounding is computed at output time).

## What to build

1. Add `location_privacy: z.enum(["exact", "coarse"])` (optional, default `exact`) to `CreateVerificationRequestSchema`. It is stored in `verification_requests.location_privacy`, added in migration 0023 (`locationPrivacy` in `schema.ts`). Save it in `requester-service` and return it in `GET` (add to the schema). The roles are separate: `publish: true` still decides whether it is public, `location_privacy` decides the precision of the location on public surfaces
2. Rounding: next to `packages/core/src/domain/areas.ts`, `coarseLocation(lat, lng)` → the centre of a 6-character geohash (about 1.2 km × 0.6 km) and `precision_m: 1200`. Write the geohash in 30 lines without adding a dependency
3. On three public surfaces, requests with `location_privacy = coarse` show `location` as the rounded centre plus `location_precision_m: 1200`: `public-service.ts` (`GET /v1/public/verifications/{id}` and `publishedView`), `map-service.ts` (the map; draw the pin as a translucent circle in `components/public-map.tsx`), and the dataset (`/v1/public/dataset`). The requester's `GET` stays exact
4. Add `location_commitment: sha256(lat,lng,salt)` (hex with a `sha256:` prefix) to the evidence bundle (`packages/core/src/evidence/bundle.ts`). A per-request random salt cannot be stored in `verification_requests`, so use `task_id_hash` as the salt (it is public, but note in chapter 07 that brute-forcing lat/lng at 6 decimals is impractical). It is included in `evidence_root`. Keep the ordering of `normalizeBundle`
5. On the proof page `/r/[id]` and the map's description, the label "approximate location (about 1 km)" and a magnifying-glass line drawing
6. Docs: one paragraph in 01 §4.22, and `location_commitment` in chapter 07

## Tests
One `coarse` case each in `apps/web/test/map.test.ts` and the public result test: `location` on public surfaces is rounded and the requester's `GET` is exact. In `packages/core/test`, a known geohash value (e.g. 35.6595,139.7005 → `xn76ur`) and the centre from `coarseLocation`.

## Done when
Only rounded locations appear on public surfaces, and the requester's GET shows the exact location.
