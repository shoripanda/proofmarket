// docs/architecture 16 — sensory reports: the requester names senses (one is enough), the server builds the
// fixed form, a measured sound level must come with when it was measured, a sense may be declined, and the
// result summarises tags and statuses across witnesses.
import { resultHash, resultHashInput, toSha256Hex } from "@proofmarket/core";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate, handleGet } from "../lib/handlers/requester";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask, witness } from "./support/worker";

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
  question: "The street in front of the station's north exit",
  answer_schema: { type: "sensory", senses },
  ...o,
});
/** A 10 s measurement starting now (the challenge is issued at the same fixed clock). */
const tenSeconds = () => ({
  measurements: {
    sound: {
      started_at: t.app.now().toISOString(),
      ended_at: new Date(t.app.now().getTime() + 10_000).toISOString(),
    },
  },
});

describe("creating a sensory report (16 §4)", () => {
  it("one sense is enough: the server builds the hearing block from the catalogue", async () => {
    const res = await create(sensory(["hearing"]));
    expect(res.status).toBe(201);
    const { verification_id: id } = await json(res);
    const view = await get(id);
    expect(view.answer_schema.type).toBe("form");
    expect(view.answer_schema.fields.map((f: { key: string }) => f.key)).toEqual([
      "hearing_status",
      "hearing_level_db",
      "hearing_peak_db",
      "hearing_loudness",
      "hearing_sources",
      "hearing_note",
    ]);
  });

  it("all five senses at once is allowed, past the usual 8-field limit", async () => {
    const res = await create(sensory(["touch", "sight", "taste", "smell", "hearing"]));
    expect(res.status).toBe(201);
    const view = await get((await json(res)).verification_id);
    expect(view.answer_schema.fields).toHaveLength(28);
    // catalogue order, whatever order the requester named them in
    expect(view.answer_schema.fields[0].key).toBe("sight_status");
  });

  it("the sensory form is only for SENSORY_REPORT, and SENSORY_REPORT only takes it", async () => {
    expect((await create({ ...sensory(["smell"]), type: "CUSTOM_TASK" })).status).toBe(400);
    const plain = await create(sensory(["smell"], { answer_schema: { type: "text" } }));
    expect(plain.status).toBe(400);
    expect((await json(plain)).error.details.reason).toBe("sensory_needs_senses");
    expect((await create(sensory([]))).status).toBe(400);
    expect((await create(sensory(["smell", "smell"]))).status).toBe(400);
  });

  it("optimistic verification and the public map are not offered (answers are text)", async () => {
    expect((await create(sensory(["hearing"], { assurance: { level: "optimistic" } }))).status).toBe(400);
    expect((await create(sensory(["hearing"], { publish: true }))).status).toBe(400);
  });
});

describe("answering (16 §6, §8)", () => {
  it("a measured level needs its measurement window, 8-20 s, after the challenge", async () => {
    const id = await openTask(t, sensory(["hearing"]));
    const { token } = await onboardWorker(t, "w1");
    const answer = JSON.stringify({
      hearing_status: "reported",
      hearing_level_db: 64.2,
      hearing_peak_db: 71,
      hearing_loudness: 3,
      hearing_sources: ["traffic", "voices"],
    });
    const missing = await witness(t, token, id, { answer });
    expect(missing.res.status).toBe(400);
    expect(missing.body.error).toMatchObject({ details: { reason: "required_with_sound_level" } });

    const short = await witness(t, token, id, {
      answer,
      claimId: missing.claimId,
      extra: {
        measurements: {
          sound: {
            started_at: t.app.now().toISOString(),
            ended_at: new Date(t.app.now().getTime() + 3_000).toISOString(),
          },
        },
      },
    });
    expect(short.body.error).toMatchObject({ details: { reason: "duration_out_of_range" } });

    const early = await witness(t, token, id, {
      answer,
      claimId: missing.claimId,
      extra: {
        measurements: {
          sound: {
            started_at: new Date(t.app.now().getTime() - 600_000).toISOString(),
            ended_at: new Date(t.app.now().getTime() - 590_000).toISOString(),
          },
        },
      },
    });
    expect(early.body.error).toMatchObject({ details: { reason: "outside_challenge" } });

    const ok = await witness(t, token, id, { answer, claimId: missing.claimId, extra: tenSeconds() });
    expect(ok.body.state).toBe("VALID");
  });

  it("without the microphone, loudness and sources alone are a valid hearing report", async () => {
    const id = await openTask(t, sensory(["hearing"]));
    const { token } = await onboardWorker(t, "w1");
    const { body } = await witness(t, token, id, {
      answer: JSON.stringify({
        hearing_status: "reported",
        hearing_loudness: 2,
        hearing_sources: ["nature"],
      }),
    });
    expect(body.state).toBe("VALID");
  });

  it("declining every sense is not an answer; values under a declined sense are refused", async () => {
    const id = await openTask(t, sensory(["smell", "taste"]));
    const { token } = await onboardWorker(t, "w1");
    const none = await witness(t, token, id, {
      answer: JSON.stringify({ smell_status: "declined", taste_status: "declined" }),
    });
    expect(none.res.status).toBe(400);
    expect(none.body.error).toMatchObject({ code: "ANSWER_INVALID" });
    const stray = await witness(t, token, id, {
      claimId: none.claimId,
      answer: JSON.stringify({ smell_status: "declined", smell_intensity: 3, taste_status: "not_present" }),
    });
    expect(stray.body.error).toMatchObject({ code: "ANSWER_INVALID" });
    // declining taste while reporting smell is fine
    const ok = await witness(t, token, id, {
      claimId: none.claimId,
      answer: JSON.stringify({
        smell_status: "reported",
        smell_intensity: 4,
        smell_pleasantness: 2,
        smell_kinds: ["damp"],
        taste_status: "declined",
        taste_note: "Not comfortable tasting it",
      }),
    });
    expect(ok.body.state).toBe("VALID");
  });

  it("tags must come from the list, at most 3, each once", async () => {
    const id = await openTask(t, sensory(["touch"]));
    const { token } = await onboardWorker(t, "w1");
    const base = { touch_status: "reported", touch_temperature: "cool" };
    const bad = await witness(t, token, id, {
      answer: JSON.stringify({ ...base, touch_texture: ["smooth", "rough", "soft", "hard"] }),
    });
    expect(bad.body.error).toMatchObject({ code: "ANSWER_INVALID" });
    const unknown = await witness(t, token, id, {
      claimId: bad.claimId,
      answer: JSON.stringify({ ...base, touch_texture: ["slimy"] }),
    });
    expect(unknown.body.error).toMatchObject({ code: "ANSWER_INVALID" });
    const ok = await witness(t, token, id, {
      claimId: bad.claimId,
      answer: JSON.stringify({ ...base, touch_texture: ["rough", "smooth"] }),
    });
    expect(ok.body.state).toBe("VALID");
  });
});

describe("summaries across witnesses (16 §7)", () => {
  it("medians for levels, shares for tags, counts for statuses, all in result_hash", async () => {
    const id = await openTask(t, sensory(["hearing", "smell"], { assurance: { level: "high" } }));
    const answers = [
      {
        hearing_status: "reported",
        hearing_level_db: 62,
        hearing_peak_db: 70,
        hearing_loudness: 3,
        hearing_sources: ["traffic", "voices"],
        smell_status: "reported",
        smell_intensity: 2,
        smell_pleasantness: 3,
        smell_kinds: ["exhaust"],
      },
      {
        hearing_status: "reported",
        hearing_level_db: 66.5,
        hearing_peak_db: 75,
        hearing_loudness: 4,
        hearing_sources: ["traffic"],
        smell_status: "not_present",
      },
      {
        hearing_status: "reported",
        hearing_level_db: 58,
        hearing_peak_db: 63,
        hearing_loudness: 3,
        hearing_sources: ["traffic", "announcements"],
        smell_status: "declined",
      },
    ];
    for (const [i, a] of answers.entries()) {
      const { token } = await onboardWorker(t, `w${i}`);
      const { body } = await witness(t, token, id, { answer: JSON.stringify(a), extra: tenSeconds() });
      expect(body.state).toBe("VALID");
    }
    const { result } = await get(id);
    expect(result.status).toBe("VERIFIED");
    expect(result.aggregate).toEqual({
      hearing_status: { counts: { reported: 3, not_present: 0, declined: 0 }, n: 3 },
      hearing_level_db: { median: 62, min: 58, max: 66.5, n: 3 },
      hearing_peak_db: { median: 70, min: 63, max: 75, n: 3 },
      hearing_loudness: { median: 3, min: 3, max: 4, n: 3 },
      hearing_sources: { shares: { traffic: 1, voices: 0.333, announcements: 0.333 }, n: 3 },
      smell_status: { counts: { reported: 1, not_present: 1, declined: 1 }, n: 3 },
    });
    expect(toSha256Hex(resultHash(resultHashInput(result)))).toBe(result.result_hash);
  });
});
