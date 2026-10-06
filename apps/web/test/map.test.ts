// Public map (01 §4.22): only results their requester published, for 72 hours, with no photo or worker data.
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate } from "../lib/handlers/requester";
import { revokeEvidenceAccess } from "../lib/services/admin-service";
import { publicDataset, publicMap } from "../lib/services/map-service";
import { publicResult } from "../lib/services/public-service";
import { call, createBody, createTestApp, jsonReq, SHOP } from "./support/app";
import { onboardWorker, openTask, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
});
const create = (o: Record<string, unknown>) =>
  call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
const details = async (r: Response) => ((await r.json()) as { error: { details: unknown } }).error.details;

describe("public map", () => {
  it("publish needs a place and a choice or number answer", async () => {
    const noPlace = await create({
      type: "CUSTOM_CHOICE",
      answer_schema: { type: "enum", values: ["YES", "NO"] },
      location: undefined,
      publish: true,
    });
    expect(noPlace.status).toBe(400);
    expect(await details(noPlace)).toMatchObject({ field: "publish", reason: "needs_location" });
    const text = await create({
      type: "SIGN_TRANSCRIPTION",
      answer_schema: { type: "text" },
      publish: true,
    });
    expect(text.status).toBe(400);
    expect(await details(text)).toMatchObject({ field: "publish", reason: "not_for_text_answers" });
  });

  it("lists a published VERIFIED result with its question and place, and nothing unpublished", async () => {
    const kept = await openTask(t);
    await witness(t, alice, kept, { answer: "OPEN" });
    expect((await publicMap(t.app)).items).toEqual([]);
    expect((await publicResult(t.app, kept)).published).toBeNull();

    const shared = await openTask(t, { publish: true });
    expect((await publicMap(t.app)).items).toEqual([]); // no result yet
    await witness(t, alice, shared, { answer: "CLOSED" });
    const map = await publicMap(t.app);
    expect(map.max_age_hours).toBe(72);
    expect(map.items).toEqual([
      expect.objectContaining({
        verification_id: shared,
        type: "PLACE_STATUS_VERIFICATION",
        question: "Is this shop open right now?",
        answer: "CLOSED",
        answer_kind: "enum",
        location: SHOP,
        place_name: "test shop",
        witnesses: 1,
        result_url: `/r/${shared}`,
      }),
    ]);
    expect(JSON.stringify(map)).not.toMatch(/wkr_|Walletalice|storage\.test|evidence/);
    expect((await publicResult(t.app, shared)).published).toEqual({
      question: "Is this shop open right now?",
      location: SHOP,
      place_name: "test shop",
    });
  });

  it("keeps only the newest result per place and question, drops it after 72 hours or when access is revoked", async () => {
    const first = await openTask(t, { publish: true });
    await witness(t, alice, first, { answer: "OPEN" });
    t.advance(60 * 60_000);
    const bob = (await onboardWorker(t, "bob")).token;
    const second = await openTask(t, {
      publish: true,
      deadline: new Date(t.app.now().getTime() + 60 * 60_000).toISOString(),
    });
    await witness(t, bob, second, { answer: "CLOSED" });
    expect((await publicMap(t.app)).items.map((i) => i.verification_id)).toEqual([second]);

    await revokeEvidenceAccess(t.db, second, "test");
    expect((await publicMap(t.app)).items.map((i) => i.verification_id)).toEqual([first]);
    expect((await publicResult(t.app, second)).published).toBeNull();

    t.advance(72 * 3600_000);
    expect((await publicMap(t.app)).items).toEqual([]);
    // 01 §4.24: the dataset keeps old observations, still without the revoked one, with hashes and the proof URL
    const d = await publicDataset(t.app);
    expect(d.license).toBe("CC-BY-4.0");
    expect(d.rows.map((r) => r.verification_id)).toEqual([first]);
    expect(d.rows[0]).toMatchObject({
      type: "PLACE_STATUS_VERIFICATION",
      answer: "OPEN",
      place_name: "test shop",
      witnesses: 1,
      proof_url: `http://localhost:3000/r/${first}`,
    });
    expect(d.rows[0]?.evidence_root).toMatch(/^[0-9a-f]{64}$/);
    expect(d.rows[0]?.result_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(d)).not.toMatch(/wkr_|Walletalice|storage\.test/);
  });
});
