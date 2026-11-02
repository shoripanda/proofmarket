// docs/architecture 16, part 2 — audio clips on request (§9) and hearing-only requests at a place that may go
// without a photo (§4).
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate, handleEvidenceUrls, handleGet } from "../lib/handlers/requester";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { m4a, onboardWorker, openTask, W, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

// biome-ignore lint/suspicious/noExplicitAny: test convenience
const json = async (res: Response): Promise<any> => res.json();
const create = (o: Record<string, unknown>) =>
  call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
const get = async (id: string) =>
  json(
    await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey })),
  );
const sensory = (senses: string[], o: Record<string, unknown> = {}) => ({
  type: "SENSORY_REPORT",
  question: "The park entrance on the east side",
  answer_schema: { type: "sensory", senses },
  ...o,
});
const noPhoto = { evidence_requirements: { photo: false, task_nonce: true } };
const tenSeconds = () => ({
  measurements: {
    sound: {
      started_at: t.app.now().toISOString(),
      ended_at: new Date(t.app.now().getTime() + 10_000).toISOString(),
    },
  },
});
const measured = JSON.stringify({
  hearing_status: "reported",
  hearing_level_db: 58.4,
  hearing_peak_db: 66,
  hearing_loudness: 2,
  hearing_sources: ["nature", "voices"],
});
const felt = JSON.stringify({ hearing_status: "reported", hearing_loudness: 2, hearing_sources: ["nature"] });

describe("request rules (16 §4, §9)", () => {
  it("a clip needs hearing; going without a photo needs hearing alone, at a place", async () => {
    const clipOnSmell = await create(sensory(["smell"], { audio: { clip: "optional" } }));
    expect((await json(clipOnSmell)).error.details).toMatchObject({
      field: "audio",
      reason: "needs_hearing",
    });
    const clipOnShop = await create({ audio: { clip: "required", max_seconds: 10 } });
    expect((await json(clipOnShop)).error.details.reason).toBe("needs_hearing");

    const twoSenses = await create(sensory(["hearing", "smell"], noPhoto));
    expect((await json(twoSenses)).error.details.reason).toBe("photo_needs_hearing_only");
    const nowhere = await create(sensory(["hearing"], { ...noPhoto, location: undefined }));
    expect((await json(nowhere)).error.details.reason).toBe("photo_needs_location");
    expect(
      (await create(sensory(["hearing"], { audio: { clip: "optional", max_seconds: 30 } }))).status,
    ).toBe(400);
  });

  it("the requester sees what a submission must carry", async () => {
    const res = await create(
      sensory(["hearing"], { ...noPhoto, audio: { clip: "optional", max_seconds: 10 } }),
    );
    expect(res.status).toBe(201);
    const view = await get((await json(res)).verification_id);
    expect(view.evidence_requirements).toEqual({ photo: false, task_nonce: true });
    expect(view.audio).toEqual({ clip: "optional", max_seconds: 10 });
    const plain = await get((await json(await create({}))).verification_id);
    expect(plain.evidence_requirements.photo).toBe(true);
    expect(plain.audio).toBeNull();
  });
});

describe("hearing without a photo (16 §4)", () => {
  it("the measured level at the place is the evidence; without it a photo is needed", async () => {
    const id = await openTask(t, sensory(["hearing"], noPhoto));
    const { token } = await onboardWorker(t, "w1");
    t.app.reviewer = t.reviewer;
    const none = await witness(t, token, id, { answer: felt, photos: [] });
    expect(none.res.status).toBe(400);
    expect(none.body.error).toMatchObject({ details: { reason: "photo_or_sound_level_required" } });
    const ok = await witness(t, token, id, {
      answer: measured,
      photos: [],
      claimId: none.claimId,
      extra: tenSeconds(),
    });
    expect(ok.body.state).toBe("VALID");
    expect(ok.body.checks).toMatchObject({
      media_schema: "not_run",
      geofence: "pass",
      vision_consistency: "not_run",
    });
    expect(t.reviewer.seen).toHaveLength(0); // nothing to look at
  });

  it("still needs to be at the place", async () => {
    const id = await openTask(t, sensory(["hearing"], noPhoto));
    const { token } = await onboardWorker(t, "w1");
    const far = await witness(t, token, id, {
      answer: measured,
      photos: [],
      at: { lat: 35.7, lng: 139.8 },
      extra: tenSeconds(),
    });
    expect(far.body).toMatchObject({ state: "INVALID", checks: { geofence: "fail" } });
  });

  it("every other request still needs a photo", async () => {
    const id = await openTask(t, sensory(["hearing"]));
    const { token } = await onboardWorker(t, "w1");
    const r = await witness(t, token, id, { answer: measured, photos: [], extra: tenSeconds() });
    expect(r.res.status).toBe(400);
    expect(r.body.error).toMatchObject({ details: { field: "evidence", reason: "photo_required" } });
  });
});

describe("audio clips (16 §9)", () => {
  it("a required clip must be sent; it is served to the requester and never reviewed", async () => {
    const id = await openTask(t, sensory(["hearing"], { audio: { clip: "required", max_seconds: 10 } }));
    const { token } = await onboardWorker(t, "w1");
    t.app.reviewer = t.reviewer;
    const missing = await witness(t, token, id, { answer: felt });
    expect(missing.body.error).toMatchObject({ details: { field: "audio", reason: "required" } });
    const ok = await witness(t, token, id, {
      answer: felt,
      claimId: missing.claimId,
      clip: { bytes: m4a(), durationMs: 9500 },
    });
    expect(ok.body.state).toBe("VALID");
    expect(t.reviewer.seen).toHaveLength(1);
    expect(t.reviewer.seen[0]?.images).toHaveLength(1); // the photo only

    const urls = await json(
      await call(
        (r) => handleEvidenceUrls(t.app, r, id),
        jsonReq("GET", `/v1/verifications/${id}/evidence`, { key: t.apiKey }),
      ),
    );
    expect(urls.evidence.map((e: { media_type: string }) => e.media_type)).toEqual([
      "image/jpeg",
      "audio/mp4",
    ]);
    expect(urls.evidence[1]).toMatchObject({ duration_ms: 9500 });
    expect(urls.evidence[1].url).toMatch(/\.m4a\?/);
  });

  it("no clip upload unless asked for; one per challenge", async () => {
    const plain = await openTask(t, sensory(["hearing"]));
    const asked = await openTask(t, sensory(["hearing"], { audio: { clip: "optional" } }));
    const { token } = await onboardWorker(t, "w1");
    const w = W(t, token);
    for (const [id, first] of [
      [plain, 400],
      [asked, 201],
    ] as const) {
      const { claim_id } = await json(await w.claim(id));
      const ch = await json(await w.challenge(claim_id));
      const up = await w.upload(claim_id, ch.challenge_id, { content_type: "audio/webm", byte_size: 30_000 });
      expect(up.status).toBe(first);
      if (first === 201) {
        expect((await json(up)).max_bytes).toBe(2 * 1024 * 1024);
        const again = await w.upload(claim_id, ch.challenge_id, {
          content_type: "audio/mp4",
          byte_size: 30_000,
        });
        expect((await json(again)).error.details.reason).toBe("upload_limit");
        // photos still have their own allowance
        expect((await w.upload(claim_id, ch.challenge_id)).status).toBe(201);
        const big = await w.upload(claim_id, ch.challenge_id, {
          content_type: "audio/mp4",
          byte_size: 3 * 1024 * 1024,
        });
        expect(big.status).toBe(413);
      }
    }
  });

  it("checked for format, length and replay", async () => {
    const id = await openTask(
      t,
      sensory(["hearing"], { audio: { clip: "optional", max_seconds: 5 }, assurance: { level: "high" } }),
    );
    const one = await onboardWorker(t, "w1");
    const notAudio = await witness(t, one.token, id, { answer: felt, clip: { bytes: randomBytes(20_000) } });
    expect(notAudio.body).toMatchObject({ state: "INVALID", reason_code: "MEDIA_TYPE_UNSUPPORTED" });
    const long = await witness(t, one.token, id, {
      answer: felt,
      claimId: notAudio.claimId,
      clip: { bytes: m4a(), durationMs: 9000 },
    });
    expect(long.body).toMatchObject({ state: "INVALID", reason_code: "MEDIA_TOO_LARGE" });
    const same = m4a();
    const ok = await witness(t, one.token, id, {
      answer: felt,
      claimId: notAudio.claimId,
      clip: { bytes: same, durationMs: 4800 },
    });
    expect(ok.body.state).toBe("VALID");
    const two = await onboardWorker(t, "w2");
    const replay = await witness(t, two.token, id, { answer: felt, clip: { bytes: same, durationMs: 4800 } });
    expect(replay.body).toMatchObject({ state: "INVALID", reason_code: "EVIDENCE_REPLAYED" });
  });
});
