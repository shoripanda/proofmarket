# 07. Evidence Collection and Verification Design

> English translation. The Japanese version in [`../ja/07-evidence-verification-design.md`](../ja/07-evidence-verification-design.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. What Can and Cannot Be Verified

Verification accumulates circumstantial evidence that "this photo was taken and sent for this task, near this place, after the nonce was issued." It is not proof that the worker was physically there (`privacy-security.md` Section 2).

| What can be verified | What cannot be verified |
|---|---|
| The photo reached the server within a set time after the nonce was issued | That the photo was taken at that time (a device clock can be faked) |
| The location reported by the device is inside the geofence | That the location is not spoofed (the browser Geolocation API cannot detect spoofing) |
| The same photo file has not been used before | That the photo is not a re-shot of another device's screen |
| No similar photo came from another task or another worker (P1) | Collusion among multiple workers |

The weakness on the "cannot be verified" side is compensated for with multiple witnesses (P1) and invitation-only workers. The pitch and the screens never say "cannot be forged" (`legal-checklist.md` Section 6).

## 2. Capture Flow (Client)

```text
W-04 Task detail ──"Accept"──▶ POST claim
W-05 On the way  ──"I've arrived"──▶ Check location permission
W-06 Capture screen
  1. Receive a nonce with POST /claims/{id}/challenge (show the remaining time on screen)
  2. Show live video with getUserMedia({ video: { facingMode: "environment" } })
  3. The capture button draws one video frame onto a canvas and makes a JPEG (quality 0.85, long edge within 1920px)
  4. At the same time, call navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  5. Choose the answer (OPEN / CLOSED / UNCLEAR)
  6. POST /claims/{id}/uploads → PUT to the signed URL
  7. POST /tasks/{id}/evidence (the Idempotency-Key is derived from upload_id)
W-07 Verification result
```

Photos can only be taken with the in-app camera, and there is no path to pick one from the device gallery. Only on devices where `getUserMedia` is unavailable, switch to `<input type="file" accept="image/jpeg" capture="environment">`, and attach `fallback_capture` to `risk_flags` for that submission.

Because the JPEG is made from a canvas, the original photo's EXIF is never included in the first place. The server still re-encodes the image anyway (Section 3).

The capture screen always shows: "Capture the storefront, signage, and posted business hours," "Avoid getting people's faces large in the frame," and "Do not enter restricted areas inside the shop or premises" (`privacy-security.md` Sections 3-4).

## 3. Server Processing Order

After a submission passes the pre-checks of the submission API (Chapter 05 Section 3.6), the server runs the checks in the following order. It stops at the first check that fails and marks the rest `not_run` (REQ-X-V-101). Reading the photo and computing its hash are always done for every submission, and that photo is added to the comparison set for replay (Chapter 01 Section 4.7). For that reason media and replay come first, and the time and location checks come after.

| Order | check_type | Pass condition | reason_code on failure | Retry |
|---|---|---|---|---|
| 0 | `claim_binding` | The claim is the caller's own ACTIVE claim and matches the task (records what was already confirmed in the pre-checks) | — | — |
| 0 | `task_window` | DB `now()` < deadline, and the task is open for submissions | — | — |
| 0 | `task_nonce` | The nonce matches the ISSUED one for this claim and is unused (records what was already confirmed in the pre-checks; expiry is handled by `freshness`) | — | — |
| 0 | `answer_schema` | The answer is one of the choices (already confirmed in the pre-checks) | — | — |
| 1 | `media_schema` | First bytes are JPEG, size ≤ 8 MiB, decodable by sharp, short edge ≥ 480px | `MEDIA_TYPE_UNSUPPORTED` / `MEDIA_TOO_LARGE` / `MEDIA_DECODE_FAILED` | Yes |
| 2 | `replay` | The SHA-256 of the original file does not exist in `evidence_objects` (in practice, decided by whether the insert into `evidence_objects` fails on the unique constraint) | `EVIDENCE_REPLAYED` | No (claim becomes REJECTED) |
| 3 | `freshness` | `now() − challenge.issued_at ≤ freshness_max_age_s`, and the Storage object creation time ≥ `challenge.issued_at` | `EVIDENCE_STALE` | Yes |
| 4 | `geofence` | `accuracy_m ≤ 100`, and the distance to the target point (haversine) ≤ `radius_m` | `LOCATION_ACCURACY_TOO_LOW` / `EVIDENCE_OUTSIDE_GEOFENCE` | Yes |
| 5 | `duplicate` (P1) | Hamming distance of dHash to other submissions in the past 90 days > 6 | `EVIDENCE_NEAR_DUPLICATE` | No (claim becomes REJECTED) |
| 6 | `vision_consistency` (P1, optional) | Not a gate. The result is only recorded as `warning` or `pass` | — | — |

Notes:

- If the device clock and the server clock differ by 120 seconds or more, `freshness` does not change its pass/fail result; it records `machine_details.client_clock_skew_s` and attaches `clock_skew` to `risk_flags`
- If distance + accuracy exceeds the radius (the center is inside but the error circle spills outside), the check still passes and `edge_of_geofence` is attached to `risk_flags`
- Check 2 is the DB unique constraint itself (Chapter 04 Section 3.10). Even if two copies of the same file arrive at the same time, one of them fails on insert and becomes `EVIDENCE_REPLAYED`
- Check 5 excludes earlier attempts within the same claim from the comparison set. Re-shooting the same shop naturally produces a similar photo
- When `vision_consistency` is used, text visible in the image is treated as untrusted input. The prompt passes the image delimited, and the model output accepted is only enumerated values for two items: "is a storefront visible" and "are there signs that it is open for business." The result is not used for pass/fail (REQ-V-007, `users-and-stakeholders.md` Section 4)

### 3.1 Storing Images

1. Read the original file placed in `evidence-raw` via the signed URL
2. Compute SHA-256 over the original file's bytes (used in check 4 and in the evidence bundle)
3. Use sharp to correct rotation, strip EXIF, ICC, and XMP, make a JPEG with a long edge of 1280px, and place it in `evidence-derived`
4. Compute dHash (a 9×8 grayscale difference hash, 64 bits) from the derived image
5. Encrypt the original file's EXIF into `raw_metadata_enc` and delete it after 30 days

Image processing runs inside a Vercel function. An image that cannot be decoded, or that exceeds 40 megapixels, is rejected before it is passed to sharp (`limitInputPixels`).

## 4. Computing Consensus

```ts
// packages/core/src/verification/consensus.ts
type Outcome =
  | { kind: "VERIFIED"; answer: string; ratio: number }
  | { kind: "REJECTED"; reason: "NO_CONSENSUS"; ratio: number }
  | { kind: "EXPIRED"; reason: "INSUFFICIENT_WITNESSES" };

function decide(valid: { answer: string }[], quorum: number): Outcome {
  if (valid.length < quorum) return { kind: "EXPIRED", reason: "INSUFFICIENT_WITNESSES" };
  const counts = countBy(valid, (s) => s.answer);
  const max = Math.max(...Object.values(counts));
  const top = Object.keys(counts).filter((a) => counts[a] === max);
  const ratio = max / valid.length;
  if (max >= quorum && top.length === 1) return { kind: "VERIFIED", answer: top[0], ratio };
  return { kind: "REJECTED", reason: "NO_CONSENSUS", ratio };
}
```

It is called at T07, T08, T11, and T12 in Chapter 03. `consensus_ratio` is the count of the most common answer ÷ the count of valid submissions; no other numbers (such as a confidence score) are produced.

The payment recipients are everyone who made a valid submission (Chapter 01 Section 4.2). Valid submissions number at most `required_witnesses`, so the on-chain recipient limit of 5 is not exceeded.

## 5. Evidence Root and Result Hash

### 5.1 Evidence Bundle

```json
{
  "schema": "proofmarket.evidence-bundle.v1",
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "task_id_hash": "sha256:...",
  "type": "PLACE_STATUS_VERIFICATION",
  "question_hash": "sha256:...",
  "answer_values": ["CLOSED", "OPEN", "UNCLEAR"],
  "assurance": { "required_witnesses": 1, "quorum": 1 },
  "submissions": [
    {
      "witness_ref": "hmac:...",
      "answer": "OPEN",
      "evidence_sha256": ["sha256:..."],
      "server_received_at": "2026-10-09T03:14:29Z",
      "checks": { "freshness": "pass", "geofence": "pass", "media_schema": "pass", "replay": "pass", "task_nonce": "pass" }
    }
  ],
  "outcome": "VERIFIED",
  "final_answer": "OPEN",
  "finalized_at": "2026-10-09T03:14:31Z"
}
```

- `submissions` contains only valid submissions, sorted by `server_received_at` ascending, and by `evidence_sha256` ascending when the times are equal
- The array `answer_values` is sorted in lexicographic order
- `witness_ref` is `HMAC-SHA256(WORKER_REF_SALT, worker_id + ":" + verification_id)`. The value changes per task, so lining up bundles does not let anyone link them to the same worker. The operator can trace it through the DB mapping
- Coordinates, photos, and the question text itself are not included

### 5.2 Computation

```text
evidence_root = SHA-256( JCS(evidence_bundle) )          // JCS = RFC 8785
result_hash   = SHA-256( JCS(VerificationResult minus result_hash, consensus_ratio, attestation, settlement, and verified_at) )
```

`consensus_ratio` is a floating-point number whose value can change in a round trip through the DB `numeric` type, so it is excluded from the input (anyone can compute it from `answer_counts`). `finalized_at` is decided by the app exactly once, and the same value is put into the bundle and the DB.

Use the npm `canonicalize` package (an RFC 8785 implementation) and do not implement it yourself. The notation is `sha256:<hex>` in the API and the raw 32-byte value on-chain.

Unit tests check that the same input always produces the same root, using pairs of fixed bundles and expected values (`onchain-data-model.md` Section 5). The Stretch public verification API (REQ-X-R-102) exists to return this bundle so that a third party can recompute the result.

## 6. Reason Messages Shown to the Worker

| reason_code | Display text (English rendering of the Japanese UI string) |
|---|---|
| `EVIDENCE_STALE` | The capture window ({n} minutes) has passed. Press "Start capture" again. |
| `LOCATION_ACCURACY_TOO_LOW` | Location accuracy is too low (error {a} m). Go somewhere outdoors with a clear view of the sky, wait a moment, and shoot again. |
| `EVIDENCE_OUTSIDE_GEOFENCE` | The photo was taken {d} m from the shop. Move within {r} m and shoot again. |
| `MEDIA_DECODE_FAILED` | The photo could not be read. Please shoot again. |
| `EVIDENCE_REPLAYED` | This is the same file as a photo used before. This task has ended. |
| `EVIDENCE_NEAR_DUPLICATE` | This photo is almost identical to another submission. This task has ended. |
| `NONCE_EXPIRED` | The capture window has passed. Press "Start capture" again. |

English versions of the messages are added in P1.
