# 16. Sensory reports: the five senses as verification answers (2026-11-02)

The owner asked for a way to collect what people perceive with all five senses. An agent can read the web, but it cannot hear how loud a street is at 11 pm, smell whether a flat is damp, taste a new snack or feel whether a fabric is rough. This chapter designs a verification type for that.

**Status (2026-11-02).** Part 1 is implemented: the type, the catalogue, the `tags` field, declining a sense, the summaries, the sound level measured on the phone, and migration 0036. Part 2 is not built yet: audio clips (§9) and hearing-only requests without a photo (§4). Until then every submission still needs a photo, and `audio` is not accepted.

## 1. Decisions taken (owner, 2026-11-02)

| Question | Answer |
|---|---|
| Where | A new **verification** type, not general-task evidence. Answers have a fixed shape, so several witnesses can be compared and summarised |
| Hearing | A sound level measured on the phone by default, with no audio kept. A short clip (15 s at most) only when the requester asks for one |
| Taste | **No restriction on what may be tasted.** The worker may always decline a sense (§6). The terms must cover it (§10) |
| Scope now | This document first; implementation after review |

## 2. What already exists

- Photos: JPEG only, up to 4 per submission, geofence, task nonce, freshness, exact and near-duplicate checks, 30-day retention (`LIMITS.media`, `RETENTION_DAYS.raw_evidence`).
- Form answers with `scale` fields, 1-5 or 1-10 with words at both ends (implementation spec 13 §4, "senses index").
- `result.aggregate[key] = { median, min, max, n }` for number and scale fields once 3 or more answers are accepted (`apps/web/lib/services/aggregate.ts`).
- Several witnesses through `assurance` (fast, standard, high), and AI review that looks at the request, the answer and the photos.

A requester can already build a "smell, noise, cleanliness, brightness" form by hand with `CUSTOM_TASK`. What is missing: (1) every requester invents their own fields, so answers cannot be compared across requests or areas; (2) there is no measured sound level and no audio; (3) there is no way to say "I could not smell anything" or "I chose not to taste it" apart from leaving a field empty; (4) a scale cannot record *what kind* of smell or sound it was.

## 3. Two kinds of sense data

| Sense | Measured by the phone | Reported by the person | Evidence that supports the report |
|---|---|---|---|
| Sight | Photo (existing) | Brightness, cleanliness | The photo itself |
| Hearing | Sound level over 10 s (approximate dB), optional clip | Loudness, main sources | The level, the clip if any |
| Smell | — | Intensity, pleasantness, kind | A photo of the place or the thing |
| Taste | — | Five basic tastes, overall liking | A photo of the item |
| Touch | — | Texture, temperature, firmness | A photo of the surface or the thing |

A measured value can be checked against itself (range, duration, replay). A reported value cannot be checked from the evidence at all: nobody can prove what someone smelt. Confidence in reported senses therefore comes from **several witnesses agreeing** (§7), not from the evidence. The API says so per field (`source: "measured" | "reported"`), so an agent does not mistake a report for a measurement.

## 4. The task type `SENSORY_REPORT`

```json
POST /v1/verifications
{
  "type": "SENSORY_REPORT",
  "question": "The street in front of the station's north exit",
  "answer_schema": { "type": "sensory", "senses": ["hearing", "smell"] },
  "location": { "lat": 35.658, "lng": 139.701, "radius_m": 100 },
  "assurance": { "level": "high" },
  "bounty": { "asset": "USDC", "amount": "0.5", "network": "solana-devnet" }
}
```

(Other fields as for any verification. `audio` is part 2.)

- `answer_schema: { type: "sensory", senses }`: any of `sight`, `hearing`, `smell`, `taste`, `touch`, **one is enough** (owner, 2026-11-02). A request for only `["hearing"]` or only `["taste"]` is normal; asking for all five is never required. The requester chooses senses, **not fields**: the server builds the form from the fixed catalogue in §5, for the chosen senses only. This is what makes answers comparable.
- `question`: what to perceive. It is requester text, so it is never put in a push (15 §1).
- `location`: optional, as for `PRODUCT_INSPECTION`. When given, the usual geofence, nonce and freshness apply to the photo and to the sound measurement.
- `audio` (part 2): only with `hearing`. `clip` is `none` (default), `optional` or `required`; `max_seconds` is 5-15.
- A photo is required, except (part 2) for a hearing-only request with a `location`. There the sound measurement itself is tied to the place (§8), and a photo is optional. For every other request the photo is the only thing that shows the worker was in front of the target.

A hearing-only request is the smallest case: "measure how loud it is here".

```json
POST /v1/verifications
{
  "type": "SENSORY_REPORT",
  "senses": ["hearing"],
  "target": "The park entrance on the east side",
  "location": { "lat": 35.672, "lng": 139.694, "radius_m": 100 },
  "assurance": { "level": "high" },
  "bounty": { "asset": "USDC", "amount": "0.3" }
}
```

Three workers go there, each phone measures for 10 s, and the agent gets the median, min and max of `hearing_level_db` with each measurement's time.
- The form is stored like any form (`answer_kind = text`, the fields in `answer_spec`), so storage, views and aggregation are reused. Requests and results show the built form, never the shorthand. A form with exactly the catalogue fields is accepted only for `SENSORY_REPORT`, and `SENSORY_REPORT` accepts nothing else. A sensory form may exceed the usual 8 fields (all five senses make 28).
- Optimistic verification and `publish` are refused, as for every text answer.

## 5. The fixed catalogue

Field keys are prefixed with the sense, so they never collide and stay the same in every request.

| Sense | Field | Shape | Source |
|---|---|---|---|
| sight | `sight_brightness` | scale 1-5, dark ↔ bright | reported |
| sight | `sight_cleanliness` | scale 1-5, dirty ↔ clean | reported |
| hearing | `hearing_level_db` | number, approximate dB, Leq over 10 s | measured |
| hearing | `hearing_peak_db` | number, approximate dB, highest 1 s | measured |
| hearing | `hearing_loudness` | scale 1-5, quiet ↔ loud | reported |
| hearing | `hearing_sources` | tags, up to 3: traffic, voices, music, construction, machinery, nature, announcements, other | reported |
| smell | `smell_intensity` | scale 1-5, none ↔ strong | reported |
| smell | `smell_pleasantness` | scale 1-5, unpleasant ↔ pleasant | reported |
| smell | `smell_kinds` | tags, up to 3: food, coffee, smoke or tobacco, exhaust, drain or sewage, damp or mould, chemical, perfume or flowers, rubbish, other | reported |
| taste | `taste_sweet`, `taste_salty`, `taste_sour`, `taste_bitter`, `taste_umami` | scale 1-5 each, none ↔ strong | reported |
| taste | `taste_liking` | scale 1-5, dislike ↔ like | reported |
| touch | `touch_texture` | tags, up to 3: smooth, rough, soft, hard, sticky, oily, wet, powdery | reported |
| touch | `touch_temperature` | one of cold, cool, neutral, warm, hot | reported |
| touch | `touch_firmness` | scale 1-5, soft ↔ firm | reported |
| any | `<sense>_note` | text, up to 200 characters, optional | reported |

**New form field type `tags`**: choose 1 to `max` values from a fixed list. It is general, not only for senses, and is added to `FormFieldSchema`. The answer stores an array of strings.

The vocabulary is fixed in `@proofmarket/core`, with ja and en labels. Adding a word later is compatible; removing or renaming one is not.

## 6. Declining a sense

Each sense block has "I could not perceive it" and "I chose not to". The answer stores `<sense>_status: "reported" | "not_present" | "declined"`, and the block's other fields are then empty.

- `not_present`: there was nothing to smell, the item had no taste worth scoring, and so on. It is an answer and counts.
- `declined`: the worker chose not to (most likely for taste and touch). The submission still counts for the other senses.
- A submission where every sense is `declined` is not a valid answer and is not paid. For a single-sense request, declining that sense means the worker simply does not submit.
- Because taste is unrestricted (§1), declining must never cost the worker anything: no lower trust tier, no lower rating.

## 7. Summaries for the agent

`result.aggregate` already covers numbers and scales. Two additions:

- **Tags**: `result.aggregate[key] = { shares: { food: 0.67, smoke: 0.33 }, n }`, the share of accepted answers that chose each tag.
- **Status**: `result.aggregate["<sense>_status"] = { counts: { reported, not_present, declined }, n }`.

Like the existing aggregate, these appear once 3 or more answers are accepted; a field that fewer than 3 answers filled is left out.

Both are part of `result_hash`, as the existing aggregate is. As in implementation spec 13 §4, there is no majority vote: the verification passes or fails per submission, and the summary is what the agent reads. `assurance: { level: "high" }` (three witnesses) is the recommended default and is shown in the examples.

`optimistic` is not allowed for this type, for the same reason as for text: a recheck cannot "match" a smell.

## 8. Measuring sound on the phone

- `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`, then an `AnalyserNode`. RMS over 10 s gives an equivalent level, and the highest 1 s window gives the peak.
- A phone microphone is not a calibrated sound meter. The browser gives dBFS. The app adds a fixed offset per platform (iOS, Android) and labels the result "approximate dB". Expect ±5-10 dB between phones. The API returns `"calibrated": false` and the device platform, never the model or an identifier.
- **The level belongs to the place.** When the request has a `location`, the submission's position goes through the same geofence as for photos (inside `radius_m`, accuracy within 100 m), and a submission outside the area fails `geofence` and is not counted. The precise position is kept 30 days (`precise_location`). Measuring and taking the photo happen on the same screen, a few seconds apart.
- The submission carries `measurements.sound = { started_at, ended_at }` whenever the answer has `hearing_level_db`. The server refuses it (400 `VALIDATION_FAILED`, field `measurements.sound`) when it is missing, lasts outside 8-20 s, starts before the challenge was issued or ends after the server's time, allowing 120 s of clock difference.
- The offset is provisional: 100 dB on every platform until real phones are compared with a sound meter (§13.3).
- The worker screen shows a live meter while measuring, and asks the worker to hold the phone at chest height, not in a pocket or bag, with nothing covering the microphone.
- When no clip is asked for, no audio leaves the phone. Only the two numbers do.
- If the browser refuses the microphone, the worker can still report `hearing_loudness` and sources, and the level fields are empty with `hearing_level_status: "unavailable"`.

## 9. Audio clips

- Formats: `audio/mp4` (AAC, what Safari records) and `audio/webm` (Opus, what Chrome records). At most `max_seconds`, at most 2 MiB. A new private bucket `evidence-audio`.
- The same upload flow as photos: a signed upload URL under the same challenge, sha256 for exact replay, rows in `evidence_objects` (`media_type` is already free text; `width` and `height` stay empty). A later migration adds `duration_ms`.
- Retention: 30 days, the same `raw_evidence` class as photos, and the same purge job.
- The requester gets a signed URL valid for 300 s, as for photos.
- Before recording, the screen says: "Record the surroundings, not a conversation. Do not record anyone who has not agreed." The worker can play the clip back, record again or delete it before sending.
- **AI review cannot listen.** The Claude API takes text and images, not audio. AI review gets the numbers and the text, never the clip. A clip is checked only for format, length, size and replay. This is stated in the API docs so nobody believes the clip was screened.

## 10. Safety and the terms

Taste and touch involve the worker's body, and the owner chose not to restrict them (§1). The product stays safe by not pushing anyone:

- Every sense can be declined (§6), at no cost.
- The worker screen shows a fixed note before taste or touch: "Taste or touch only if you are comfortable. Mind allergies. You can choose 'I chose not to' at any time." The text is ours, not the requester's.
- AI review may fail a submission whose photo shows something clearly not food in a taste report. It does not judge whether something was safe to eat.
- The terms must say that the worker decides whether to taste or touch, at their own risk, with no duty to do so; that requesters must not ask for anything illegal or dangerous; and how a report is handled. **This adds an item to the legal list** that must be settled before launch. Alcohol and Japan's age limit of 20 are part of that item: the platform does not check age today.

## 11. Changes

| Area | Change |
|---|---|
| `@proofmarket/core` | `SENSORY_REPORT` in `TASK_TYPES` (answer `form`, location optional); `SENSES` and the catalogue with ja/en labels; form field type `tags`; `senses` and `audio` on the request schema |
| DB, migration 0036 (part 1) | `vr_type_chk` gains `SENSORY_REPORT`; API keys that allowed every earlier type are given it too |
| DB, part 2 | `evidence_objects.duration_ms`; storage bucket `evidence-audio` (private, 2 MiB, the two audio types) |
| Evidence service | Audio uploads and their checks; sound measurement fields; `<sense>_status` handling |
| Aggregation | Tag shares and status counts (§7) |
| AI review | Prompt for this type: reported senses cannot be checked, only checked against the photo and for completeness |
| Worker app | One block per sense; the sound meter; recorder with playback; the decline buttons; the note in §10 |
| API docs, MCP, `/developers` | The type, the catalogue, the `measured` / `reported` distinction, "AI review cannot listen". The example in implementation spec 13 §4 is rewritten with `SENSORY_REPORT` |
| Push (15) | Nothing new: the push names the amount and area, never `target` |

## 12. Not in this chapter

- Video.
- Calibrated measurement, or external sensors (sound meters, gas sensors, thermometers).
- AI that listens to clips or transcribes speech.
- Using sense data in general tasks (chapter 13). It can be added later as an evidence type if asked for.
- A public map of sense data. Only the requester sees the result, as for every verification.

## 13. Questions for the owner

Answered on 2026-11-02:

1. **Payment when a sense is declined.** Paid in full if at least one sense is reported or found not present (§6). Requesters cannot require a sense.
2. **The vocabulary in §5.** As written. Requesters cannot add their own words; free text goes in `<sense>_note`.
3. **Sound offsets.** One fixed offset per platform now; real phones are measured against a sound meter later.

Still open:

4. **Age and alcohol.** To be decided with the legal list: forbid alcohol in taste reports, or add an age check for workers. Until then the worker screen shows the note in §10.
