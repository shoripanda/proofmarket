// End-to-end worker flow over PGlite + fakes (09 §2-3: D2-D6, I-FLOW-01/02/03, I-RACE-01/02, I-PRIV-01).
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleGet } from "../lib/handlers/requester";
import { handleClaimDetail, handleMe, handleOnboarding, handleYenInterest } from "../lib/handlers/worker";
import { setAllowedTaskTypes } from "../lib/services/admin-service";
import { issueInvite } from "../lib/services/worker-service";
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

const getView = async (id: string) =>
  (await (
    await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
  ).json()) as Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    any
  >;
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("worker flow", () => {
  it("onboarding: invite is single-use; payout address comes from the identity provider", async () => {
    const [w] = await t.db.select().from(schema.workers).where(eq(schema.workers.privyUserId, "alice"));
    expect(w?.payoutPubkey).toMatch(/^Walletalice/);
    const unknown = await W(t, "tok:carol").list();
    expect(await code(unknown)).toBe("WORKER_NOT_ONBOARDED");
    expect(await code(await W(t, "bad-token").list())).toBe("UNAUTHENTICATED");
  });

  it("S-10: onboarding refuses consent versions other than the documents currently shown", async () => {
    t.identity.addresses.set("dave", "Walletdave1111111111111111111111111111111111".slice(0, 44));
    const code = await issueInvite(t.db, {
      uses: 1,
      expiresAt: new Date(t.app.now().getTime() + 86_400_000),
    });
    const res = await call(
      (r) => handleOnboarding(t.app, r),
      jsonReq("POST", "/v1/worker/onboarding", {
        key: "tok:dave",
        body: {
          invite_code: code,
          consents: { worker_terms: "2026-10-03", safety_rules: "2026-10-03", privacy_notice: "2026-10-03" },
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details?: { documents?: string[] } } };
    expect(body.error.details?.documents).toEqual(["worker_terms", "privacy_notice"]);
  });

  it("I-FLOW-01 (without chain): claim -> challenge -> upload -> submit -> VERIFIED with result + evidence root", async () => {
    const id = await openTask(t);
    const list = (await (await W(t, alice).list()).json()) as {
      tasks: { verification_id: string; distance_m: number }[];
    };
    expect(list.tasks.map((x) => x.verification_id)).toEqual([id]);
    const { body } = await witness(t, alice, id, { answer: "OPEN" });
    expect(body).toMatchObject({ state: "VALID", claim_state: "ACCEPTED", reason_code: null });
    const v = await getView(id);
    expect(v.status).toBe("VERIFIED");
    expect(v.result).toMatchObject({
      status: "VERIFIED",
      answer: "OPEN",
      witnesses: { valid: 1, required: 1, quorum: 1 },
      consensus_ratio: 1,
      checks: {
        geofence: "pass",
        freshness: "pass",
        task_nonce: "pass",
        replay: "pass",
        media_schema: "pass",
      },
      settlement: { status: "PENDING" },
    });
    expect(v.result.evidence_root).toMatch(/^sha256:[0-9a-f]{64}$/);
    const jobs = (await t.db.select().from(schema.outboxJobs)).map((j) => j.dedupeKey);
    expect(jobs).toContain(`FINALIZE_AND_SETTLE:${id}`);
    expect(await (await W(t, bob).list()).json()).toEqual({ tasks: [] }); // no open slot left
  });

  it("01 §4.8: a QUEUE_LENGTH task carries its type and answers to the worker and verifies with them", async () => {
    await setAllowedTaskTypes(t.db, t.credentialId, ["PLACE_STATUS_VERIFICATION", "QUEUE_LENGTH"], "test");
    const values = ["NO_QUEUE", "SHORT_QUEUE", "LONG_QUEUE", "UNCLEAR"];
    const id = await openTask(t, { type: "QUEUE_LENGTH", answer_schema: { type: "enum", values } });
    const list = (await (await W(t, alice).list()).json()) as {
      tasks: { type: string; answer_values: string[] }[];
    };
    expect(list.tasks[0]).toMatchObject({ type: "QUEUE_LENGTH", answer_values: values });
    const bad = await witness(t, alice, id, { answer: "OPEN" });
    expect(bad.res.status).toBe(400);
    const { body } = await witness(t, alice, id, { answer: "LONG_QUEUE", claimId: bad.claimId });
    expect(body).toMatchObject({ state: "VALID" });
    const v = await getView(id);
    expect(v).toMatchObject({ type: "QUEUE_LENGTH", status: "VERIFIED", result: { answer: "LONG_QUEUE" } });
  });

  it("01 §4.15: a text task with no location is listed anywhere, skips the geofence and returns every text", async () => {
    const id = await openTask(t, {
      type: "DOCUMENT_TRANSCRIPTION",
      question: "『坊っちゃん』新潮文庫版 12ページの1段落目を書き起こしてください",
      answer_schema: { type: "text", max_chars: 500 },
      location: undefined,
    });
    // listed even far from any shop, with no distance
    const far = (await (await W(t, alice).list("lat=43.064&lng=141.347")).json()) as {
      tasks: { verification_id: string; distance_m: number | null; location: unknown }[];
    };
    expect(far.tasks).toEqual([
      expect.objectContaining({ verification_id: id, distance_m: null, location: null }),
    ]);
    const tooLong = await witness(t, alice, id, { answer: "あ".repeat(501) });
    expect(tooLong.res.status).toBe(400);
    const text = "親譲りの無鉄砲で小供の時から損ばかりしている。";
    const { body } = await witness(t, alice, id, {
      answer: `  ${text}\n`,
      at: { lat: 43.064, lng: 141.347 },
      claimId: tooLong.claimId,
    });
    expect(body).toMatchObject({ state: "VALID", checks: { geofence: "not_run" } });
    const v = await getView(id);
    expect(v.status).toBe("VERIFIED");
    expect(v.result.answers).toEqual([text]);
    expect(v.result.answer).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(v.result.answer_counts).toEqual({});
    // the public bundle never holds the text itself
    const [res] = await t.db
      .select()
      .from(schema.verificationResults)
      .where(eq(schema.verificationResults.verificationId, id));
    expect(JSON.stringify(res?.evidenceBundle)).not.toContain(text);
  });

  it("01 §4.16: the AI review sends a mismatched submission back, then records the passing review", async () => {
    t.app.reviewer = t.reviewer;
    const id = await openTask(t, {
      type: "DOCUMENT_TRANSCRIPTION",
      question: "手元の本の書名と、どこかのページの最初の1文を書き起こしてください",
      answer_schema: { type: "text" },
      location: undefined,
    });
    t.reviewer.next = { verdict: "fail", reason: "書名が書かれていません。", observed: "本の見開き" };
    const first = await witness(t, alice, id, { answer: "会社の作り方について書かれている。" });
    expect(first.body).toMatchObject({
      state: "INVALID",
      reason_code: "EVIDENCE_MISMATCH",
      retryable: true,
      checks: { vision_consistency: "fail" },
    });
    expect(first.body.reason_message_ja).toContain("書名が書かれていません。");
    // the reviewer saw the request, the answer and the photo
    expect(t.reviewer.seen[0]).toMatchObject({
      type: "DOCUMENT_TRANSCRIPTION",
      answer: "会社の作り方について書かれている。",
    });
    expect(t.reviewer.seen[0]?.question).toContain("書名");
    expect(t.reviewer.seen[0]?.image.length).toBeGreaterThan(0);
    // the worker's claim detail shows the reason too
    const detail = (await (
      await call(
        (r) => handleClaimDetail(t.app, r, first.claimId),
        jsonReq("GET", `/v1/worker/claims/${first.claimId}`, { key: alice }),
      )
    ).json()) as { submissions: { reason_message_ja: string }[] };
    expect(detail.submissions[0]?.reason_message_ja).toContain("書名が書かれていません。");

    t.reviewer.next = { verdict: "pass", reason: "書名と1文がそろっています。", observed: "本のページ" };
    const second = await witness(t, alice, id, {
      answer: "『起業の教科書』 株式会社は一人でも作れる。",
      claimId: first.claimId,
    });
    expect(second.body).toMatchObject({ state: "VALID", checks: { vision_consistency: "pass" } });
    const v = await getView(id);
    expect(v.result.checks.vision_consistency).toBe("pass");
    expect(v.result.reviews).toEqual([
      {
        verdict: "pass",
        reason: "書名と1文がそろっています。",
        observed: "本のページ",
        model: "fake-reviewer",
      },
    ]);
  });

  it("01 §4.16: an uncertain review or a review outage passes with a warning", async () => {
    t.app.reviewer = t.reviewer;
    t.reviewer.next = { verdict: "uncertain", reason: "文字が読めません。", observed: "ぼやけた紙" };
    const a = await openTask(t);
    expect((await witness(t, alice, a)).body).toMatchObject({
      state: "VALID",
      checks: { vision_consistency: "warning" },
    });
    t.reviewer.fail = true;
    const b = await openTask(t);
    expect((await witness(t, bob, b, { bytes: await photo(1280, 960) })).body).toMatchObject({
      state: "VALID",
      checks: { vision_consistency: "warning" },
    });
    expect((await getView(b)).result.reviews).toEqual([
      { verdict: "unavailable", reason: "", observed: "", model: null },
    ]);
  });

  it("01 §4.15: a number task stores the number in canonical form and checks the range", async () => {
    const id = await openTask(t, {
      type: "PRICE_CHECK",
      question: "店頭のカフェラテ（M）の値段",
      answer_schema: { type: "number", unit: "円", min: 0, max: 100000 },
    });
    const bad = await witness(t, alice, id, { answer: "高い" });
    expect(bad.res.status).toBe(400);
    const { body } = await witness(t, alice, id, { answer: "1,280", claimId: bad.claimId });
    expect(body).toMatchObject({ state: "VALID", checks: { geofence: "pass" } });
    expect((await getView(id)).result).toMatchObject({ status: "VERIFIED", answer: "1280" });
  });

  it("01 §4.10: a worker can register and withdraw interest in yen payouts; /me reports it", async () => {
    const me = async () =>
      (await (
        await call((r) => handleMe(t.app, r), jsonReq("GET", "/v1/worker/me", { key: alice }))
      ).json()) as { yen_payout_interest: boolean };
    expect((await me()).yen_payout_interest).toBe(false);
    const put = (v: unknown) =>
      call(
        (r) => handleYenInterest(t.app, r),
        jsonReq("PUT", "/v1/worker/payout-preference", { key: alice, body: { yen_interest: v } }),
      );
    expect((await put(true)).status).toBe(200);
    expect((await me()).yen_payout_interest).toBe(true);
    expect((await put("yes")).status).toBe(400);
    await put(false);
    expect((await me()).yen_payout_interest).toBe(false);
  });

  it("I-PRIV-01: requester view has no worker coordinates, worker IDs, pubkeys or photo URLs", async () => {
    const id = await openTask(t);
    await witness(t, alice, id, { at: { lat: SHOP.lat + 0.0001, lng: SHOP.lng } });
    const text = JSON.stringify(await getView(id));
    expect(text).not.toMatch(/wkr_|Walletalice|storage\.test|35\.6596/);
    const [loc] = await t.db.select().from(schema.locationObservations);
    expect(loc?.coordsEnc?.toString("utf8")).not.toContain("35.6596");
  });

  it("D4: outside geofence -> INVALID with reason, retry allowed with a new nonce, then VALID", async () => {
    const id = await openTask(t);
    const first = await witness(t, alice, id, { at: { lat: SHOP.lat + 0.0013, lng: SHOP.lng } }); // ~145 m
    expect(first.body).toMatchObject({
      state: "INVALID",
      reason_code: "EVIDENCE_OUTSIDE_GEOFENCE",
      retryable: true,
      attempts_remaining: 2,
      claim_state: "ACTIVE",
    });
    expect(first.body.reason_message_ja).toMatch(/145 m 離れた/);
    const second = await witness(t, alice, id, { claimId: first.claimId });
    expect(second.body).toMatchObject({ state: "VALID" });
    const v = await getView(id);
    expect(v.result.rejected_submissions).toEqual({ EVIDENCE_OUTSIDE_GEOFENCE: 1 });
  });

  it("accuracy > 100 m -> LOCATION_ACCURACY_TOO_LOW; three failed attempts close the claim", async () => {
    const id = await openTask(t);
    const a = await witness(t, alice, id, { accuracy: 150 });
    expect(a.body.reason_code).toBe("LOCATION_ACCURACY_TOO_LOW");
    await witness(t, alice, id, { accuracy: 150, claimId: a.claimId });
    const c = await witness(t, alice, id, { accuracy: 150, claimId: a.claimId });
    expect(c.body).toMatchObject({ claim_state: "REJECTED", attempts_remaining: 0, retryable: false });
    expect(((await (await W(t, bob).list()).json()) as { tasks: unknown[] }).tasks).toHaveLength(1); // slot freed
  });

  it("D2: the same photo on a second task -> EVIDENCE_REPLAYED and the claim is closed", async () => {
    const bytes = await photo();
    const id1 = await openTask(t);
    const id2 = await openTask(t);
    expect((await witness(t, alice, id1, { bytes })).body.state).toBe("VALID");
    const r = await witness(t, bob, id2, { bytes });
    expect(r.body).toMatchObject({
      state: "INVALID",
      reason_code: "EVIDENCE_REPLAYED",
      claim_state: "REJECTED",
      retryable: false,
    });
  });

  it("D3: expired nonce at upload -> 410 NONCE_EXPIRED; stale after upload -> EVIDENCE_STALE", async () => {
    const id = await openTask(t);
    const w = W(t, alice);
    const c = (await (await w.claim(id)).json()) as {
      claim_id: string;
      challenge: { challenge_id: string; nonce: string };
    };
    t.advance(301_000);
    expect(await code(await w.upload(c.claim_id, c.challenge.challenge_id))).toBe("NONCE_EXPIRED");
    const ch = (await (await w.challenge(c.claim_id)).json()) as { challenge_id: string; nonce: string };
    const up = (await (await w.upload(c.claim_id, ch.challenge_id)).json()) as {
      upload_id: string;
      upload_url: string;
    };
    t.storage.upload(up.upload_url.replace("https://storage.test/upload/", ""), await photo());
    t.advance(301_000);
    const res = await w.evidence(id, {
      claim_id: c.claim_id,
      answer: "OPEN",
      capture: { client_timestamp: t.app.now().toISOString(), ...SHOP, accuracy_m: 10 },
      challenge: { nonce: ch.nonce },
      evidence: [{ type: "photo", object_ref: up.upload_id }],
    });
    expect(await res.json()).toMatchObject({ state: "INVALID", reason_code: "EVIDENCE_STALE" });
  });

  it("D3': a used nonce -> 409 NONCE_USED; a wrong nonce -> NONCE_INVALID", async () => {
    const id = await openTask(t);
    const first = await witness(t, alice, id, { at: { lat: SHOP.lat + 0.002, lng: SHOP.lng } });
    const subs = await t.db.select().from(schema.witnessSubmissions);
    const [ch] = await t.db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.id, subs[0]?.challengeId ?? ""));
    expect(ch?.state).toBe("USED");
    const w = W(t, alice);
    const nch = (await (await w.challenge(first.claimId)).json()) as { challenge_id: string; nonce: string };
    const up = (await (await w.upload(first.claimId, nch.challenge_id)).json()) as { upload_id: string };
    const body = (nonce: string) => ({
      claim_id: first.claimId,
      answer: "OPEN",
      capture: { client_timestamp: t.app.now().toISOString(), ...SHOP, accuracy_m: 10 },
      challenge: { nonce },
      evidence: [{ type: "photo", object_ref: up.upload_id }],
    });
    expect(await code(await w.evidence(id, body("A".repeat(43))))).toBe("NONCE_INVALID");
  });

  it("D5: after the deadline -> 410 TASK_EXPIRED; D6: PNG / garbage / oversize", async () => {
    const id = await openTask(t);
    const w = W(t, alice);
    const c = (await (await w.claim(id)).json()) as { claim_id: string; challenge: { challenge_id: string } };
    expect(
      await code(await w.upload(c.claim_id, c.challenge.challenge_id, { content_type: "image/png" })),
    ).toBe("MEDIA_TYPE_UNSUPPORTED");
    expect(
      await code(await w.upload(c.claim_id, c.challenge.challenge_id, { byte_size: 9 * 1024 * 1024 })),
    ).toBe("MEDIA_TOO_LARGE");
    const garbage = await witness(t, alice, id, {
      claimId: c.claim_id,
      bytes: Buffer.from("not an image at all"),
    });
    expect(garbage.body.reason_code).toBe("MEDIA_TYPE_UNSUPPORTED");
    const png = await (await import("sharp"))
      .default({ create: { width: 800, height: 600, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    expect((await witness(t, alice, id, { claimId: c.claim_id, bytes: png })).body.reason_code).toBe(
      "MEDIA_TYPE_UNSUPPORTED",
    );
    t.advance(3_600_000);
    expect(await code(await W(t, bob).claim(id))).toBe("TASK_EXPIRED");
  });

  it("I-RACE-01: two workers race for the last slot -> exactly one claim", async () => {
    const id = await openTask(t);
    const rs = await Promise.all([W(t, alice).claim(id), W(t, bob).claim(id)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("I-FLOW-02/03: 2-of-2 agree -> VERIFIED; disagree -> REJECTED NO_CONSENSUS (both paid later)", async () => {
    const agree = await openTask(t, { assurance: { required_witnesses: 2, quorum: 2 } });
    await witness(t, alice, agree, { answer: "CLOSED" });
    expect((await getView(agree)).status).toBe("SUBMITTED");
    await witness(t, bob, agree, { answer: "CLOSED" });
    expect((await getView(agree)).result).toMatchObject({
      status: "VERIFIED",
      answer: "CLOSED",
      witnesses: { valid: 2 },
    });

    const split = await openTask(t, { assurance: { required_witnesses: 2, quorum: 2 } });
    await witness(t, alice, split, { answer: "OPEN" });
    await witness(t, bob, split, { answer: "CLOSED" });
    const v = await getView(split);
    expect(v.status).toBe("REJECTED");
    expect(v.result).toMatchObject({
      status: "REJECTED",
      reason: "NO_CONSENSUS",
      answer: null,
      consensus_ratio: 0.5,
    });
  });

  it("claim detail shows reasons; another worker cannot read it", async () => {
    const id = await openTask(t);
    const r = await witness(t, alice, id, { accuracy: 500 });
    const own = await call(
      (q) => handleClaimDetail(t.app, q, r.claimId),
      jsonReq("GET", "/x", { key: alice }),
    );
    expect(await own.json()).toMatchObject({
      state: "ACTIVE",
      attempts_remaining: 2,
      submissions: [{ reason_code: "LOCATION_ACCURACY_TOO_LOW" }],
    });
    const other = await call(
      (q) => handleClaimDetail(t.app, q, r.claimId),
      jsonReq("GET", "/x", { key: bob }),
    );
    expect(other.status).toBe(403);
  });

  it("derived image has no EXIF and the raw EXIF is stored encrypted", async () => {
    const sharp = (await import("sharp")).default;
    const withExif = await sharp(await photo())
      .withExif({ IFD0: { Make: "TestPhone", Model: "X" } })
      .jpeg()
      .toBuffer();
    const id = await openTask(t);
    await witness(t, alice, id, { bytes: withExif });
    const [derived] = [...t.storage.derived.values()];
    expect((await sharp(derived).metadata()).exif).toBeUndefined();
    const [ev] = await t.db.select().from(schema.evidenceObjects);
    expect(ev?.rawMetadataEnc?.includes(Buffer.from("TestPhone"))).toBe(false);
  });
});
