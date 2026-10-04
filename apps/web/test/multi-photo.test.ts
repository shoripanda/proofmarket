// Up to 4 photos per submission (01 §4.18): each its own upload under the same challenge; every photo is checked.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleEvidenceUrls } from "../lib/handlers/requester";
import { setFlag } from "../lib/services/admin-service";
import { listPendingReviews } from "../lib/services/evidence-service";
import { call, createTestApp, jsonReq, SHOP } from "./support/app";
import { onboardWorker, openTask, photo, W, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
});

const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
const uploadIdOf = (url: string) => url.match(/(upl_[0-9A-Z]+)\.jpg/)?.[1];

/** Claim, take a challenge and create `n` uploads with fresh photos. */
async function prepare(token: string, id: string, n: number) {
  const w = W(t, token);
  const { claim_id: claimId } = (await (await w.claim(id)).json()) as { claim_id: string };
  const ch = (await (await w.challenge(claimId)).json()) as { challenge_id: string; nonce: string };
  const refs: string[] = [];
  for (let i = 0; i < n; i++) {
    const up = (await (await w.upload(claimId, ch.challenge_id)).json()) as {
      upload_id: string;
      upload_url: string;
    };
    t.storage.upload(up.upload_url.replace("https://storage.test/upload/", ""), await photo());
    refs.push(up.upload_id);
  }
  const submit = (objectRefs: string[]) =>
    w.evidence(id, {
      claim_id: claimId,
      answer: "OPEN",
      capture: { client_timestamp: t.app.now().toISOString(), lat: SHOP.lat, lng: SHOP.lng, accuracy_m: 12 },
      challenge: { nonce: ch.nonce },
      evidence: objectRefs.map((object_ref) => ({ type: "photo", object_ref })),
    });
  return { w, claimId, ch, refs, submit };
}

describe("several photos per submission", () => {
  it("two photos pass; both are kept, hashed into the bundle and returned to the requester in order", async () => {
    const id = await openTask(t);
    const { body } = await witness(t, alice, id, { photos: [await photo(), await photo()] });
    expect(body).toMatchObject({ state: "VALID", claim_state: "ACCEPTED" });

    const rows = await t.db
      .select()
      .from(schema.evidenceObjects)
      .where(eq(schema.evidenceObjects.submissionId, body.submission_id as string));
    expect(rows).toHaveLength(2);
    expect(t.storage.derived.size).toBe(2);

    const [res] = await t.db
      .select()
      .from(schema.verificationResults)
      .where(eq(schema.verificationResults.verificationId, id));
    const bundle = res?.evidenceBundle as { submissions: { evidence_sha256: string[] }[] };
    expect(bundle.submissions[0]?.evidence_sha256).toHaveLength(2);

    const urls = (await (
      await call(
        (r) => handleEvidenceUrls(t.app, r, id),
        jsonReq("GET", `/v1/verifications/${id}/evidence`, { key: t.apiKey }),
      )
    ).json()) as { evidence: { witness_ref: string; url: string }[] };
    expect(urls.evidence).toHaveLength(2);
    expect(urls.evidence[0]?.witness_ref).toBe(urls.evidence[1]?.witness_ref);
    // in the order the worker sent them
    const sent = rows.toSorted((a, b) => a.id.localeCompare(b.id)).map((r) => r.uploadId);
    expect(urls.evidence.map((e) => uploadIdOf(e.url))).toEqual(sent);
  });

  it("one reused photo fails the whole submission as a replay, naming which photo", async () => {
    const reused = await photo();
    const first = await openTask(t);
    expect((await witness(t, alice, first, { bytes: reused })).body.state).toBe("VALID");
    const id = await openTask(t);
    const r = await witness(t, bob, id, { photos: [await photo(), reused] });
    expect(r.body).toMatchObject({
      state: "INVALID",
      reason_code: "EVIDENCE_REPLAYED",
      checks: { media_schema: "pass", replay: "fail" },
    });
    const [check] = await t.db
      .select()
      .from(schema.evidenceChecks)
      .where(eq(schema.evidenceChecks.submissionId, r.body.submission_id as string))
      .then((cs) => cs.filter((c) => c.checkType === "replay"));
    expect(check?.machineDetails).toMatchObject({ photo: 2 });
  });

  it("the same photo twice in one submission is a replay too", async () => {
    const id = await openTask(t);
    const same = await photo();
    const r = await witness(t, alice, id, { photos: [same, same] });
    expect(r.body).toMatchObject({ state: "INVALID", reason_code: "EVIDENCE_REPLAYED" });
  });

  it("the AI reviewer is shown every photo, in order", async () => {
    t.app.reviewer = t.reviewer;
    const id = await openTask(t);
    const { body } = await witness(t, alice, id, { photos: [await photo(), await photo(), await photo()] });
    expect(body).toMatchObject({ state: "VALID", checks: { vision_consistency: "pass" } });
    const shown = t.reviewer.seen[0]?.images ?? [];
    expect(shown).toHaveLength(3);
    const rows = (await t.db.select().from(schema.evidenceObjects)).toSorted((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(shown).toEqual(rows.map((r) => t.storage.derived.get(r.derivedObjectKey as string)));
  });

  it("the outside review list carries every photo URL, and the first as image_url for older runners", async () => {
    await setFlag(t.db, "external_review_enabled", true, "test");
    const id = await openTask(t);
    const { body } = await witness(t, alice, id, { photos: [await photo(), await photo()] });
    expect(body.state).toBe("CHECKING");
    const { reviews } = await listPendingReviews(t.app);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.image_urls).toHaveLength(2);
    expect(reviews[0]?.image_url).toBe(reviews[0]?.image_urls[0]);
    const rows = (await t.db.select().from(schema.evidenceObjects)).toSorted((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(reviews[0]?.image_urls.map(uploadIdOf)).toEqual(rows.map((r) => r.uploadId));
  });

  it("at most 4 uploads per challenge and 4 photos per submission; each photo only once", async () => {
    const id = await openTask(t);
    const { w, claimId, ch, refs, submit } = await prepare(alice, id, 4);
    const fifth = await w.upload(claimId, ch.challenge_id);
    expect(fifth.status).toBe(400);
    expect(await code(fifth)).toBe("VALIDATION_FAILED");

    expect(await code(await submit([...refs, refs[0] as string]))).toBe("VALIDATION_FAILED");
    expect(await code(await submit([refs[0] as string, refs[0] as string]))).toBe("VALIDATION_FAILED");
    const ok = (await (await submit(refs)).json()) as { state: string; checks: Record<string, string> };
    expect(ok).toMatchObject({ state: "VALID", checks: { replay: "pass", duplicate: "pass" } });
    expect(await t.db.select().from(schema.evidenceObjects)).toHaveLength(4);
  });

  it("every photo must belong to this challenge", async () => {
    const id = await openTask(t);
    const { w, claimId, refs } = await prepare(alice, id, 1);
    // a new challenge supersedes the old one; the old challenge's upload cannot ride on the new nonce
    const ch2 = (await (await w.challenge(claimId)).json()) as { challenge_id: string; nonce: string };
    const up2 = (await (await w.upload(claimId, ch2.challenge_id)).json()) as { upload_id: string };
    const r = await w.evidence(id, {
      claim_id: claimId,
      answer: "OPEN",
      capture: { client_timestamp: t.app.now().toISOString(), lat: SHOP.lat, lng: SHOP.lng, accuracy_m: 12 },
      challenge: { nonce: ch2.nonce },
      evidence: [up2.upload_id, refs[0] as string].map((object_ref) => ({ type: "photo", object_ref })),
    });
    expect(r.status).toBe(400);
    expect(await code(r)).toBe("NONCE_INVALID");
  });
});
