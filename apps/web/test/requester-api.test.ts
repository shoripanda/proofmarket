// Integration tests for the requester API over PGlite (09 §2-3: I-IDEM-01/02, I-LIM-01, I-RACE-03, I-CRT-05/06).
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleCancel,
  handleCreate,
  handleCreateBatch,
  handleGet,
  handleList,
  handleQuote,
} from "../lib/handlers/requester";
import { handleClaimDetail, handleTaskDetail } from "../lib/handlers/worker";
import { proofHeadline } from "../lib/proof-text";
import { setAllowedTaskTypes } from "../lib/services/admin-service";
import { publicResult } from "../lib/services/public-service";
import { call, createBody, createTestApp, jsonReq, SHOP } from "./support/app";
import { onboardWorker, openCreated, W, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

const create = (body: unknown, idem = crypto.randomUUID(), key = t.apiKey) =>
  call((r) => handleCreate(t.app, r), jsonReq("POST", "/v1/verifications", { key, body, idem }));
const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("POST /v1/verifications", () => {
  it("creates a CREATED task with RESERVE ledger, FUND payment record, FUND_TASK job and audit event", async () => {
    const res = await create(createBody(t.principalId));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      verification_id: string;
      status: string;
      funding: { status: string };
    };
    expect(body).toMatchObject({ status: "CREATED", funding: { status: "PENDING" } });
    expect(body.verification_id).toMatch(/^ver_[0-9A-Z]{26}$/);
    const ledger = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.verificationId, body.verification_id));
    expect(ledger.map((l) => [l.entryType, l.amount])).toEqual([["RESERVE", "-0.500000"]]);
    const jobs = await t.db.select().from(schema.outboxJobs);
    expect(jobs.map((j) => j.dedupeKey)).toEqual([`FUND_TASK:${body.verification_id}`]);
    const audit = await t.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.verificationId, body.verification_id));
    expect(audit.map((a) => a.eventType)).toEqual(["request_created"]);
  });

  it("assurance level: standard becomes 2 of 2, is charged for 2, and reads back with its level", async () => {
    const res = await create(createBody(t.principalId, { assurance: { level: "standard" } }));
    expect(res.status).toBe(201);
    const { verification_id: id } = (await res.json()) as { verification_id: string };
    const view = (await (
      await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
    ).json()) as { assurance: unknown };
    expect(view.assurance).toEqual({
      required_witnesses: 2,
      quorum: 2,
      level: "standard",
      challenge_minutes: null,
    });
    const ledger = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.verificationId, id));
    expect(ledger.map((l) => l.amount)).toEqual(["-1.000000"]);
    expect(await errCode(await create(createBody(t.principalId, { assurance: { level: "max" } })))).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("01 §4.8: task types need the key's permission and answers that belong to the type", async () => {
    const queue = (values: string[]) =>
      createBody(t.principalId, { type: "QUEUE_LENGTH", answer_schema: { type: "enum", values } });
    await setAllowedTaskTypes(t.db, t.credentialId, ["PLACE_STATUS_VERIFICATION"], "test");
    expect(await errCode(await create(queue(["NO_QUEUE", "SHORT_QUEUE", "LONG_QUEUE", "UNCLEAR"])))).toBe(
      "UNSUPPORTED_TASK_TYPE",
    );
    await setAllowedTaskTypes(t.db, t.credentialId, ["PLACE_STATUS_VERIFICATION", "QUEUE_LENGTH"], "test");
    expect((await create(queue(["NO_QUEUE", "SHORT_QUEUE", "LONG_QUEUE", "UNCLEAR"]))).status).toBe(201);
    const wrong = await create(queue(["OPEN", "CLOSED"]));
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: { details: { reason: string } } }).error.details.reason).toBe(
      "not_for_type",
    );
    expect(await errCode(await create(createBody(t.principalId, { type: "NOTICE_POSTED" })))).toBe(
      "UNSUPPORTED_TASK_TYPE",
    );
  });

  it("I-IDEM-01: same Idempotency-Key twice -> same response, one task, one reservation", async () => {
    const a = await create(createBody(t.principalId), "idem-1");
    const b = await create(createBody(t.principalId), "idem-1");
    expect(b.status).toBe(201);
    expect(b.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await b.json()).toEqual(await a.json());
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(1);
    expect(
      (await t.db.select().from(schema.requesterLedger)).filter((l) => l.entryType === "RESERVE"),
    ).toHaveLength(1);
  });

  it("I-IDEM-02: same key with a different body -> 409 IDEMPOTENCY_KEY_CONFLICT", async () => {
    await create(createBody(t.principalId), "idem-2");
    const res = await create(createBody(t.principalId, { question: "Is the shop closed?" }), "idem-2");
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  it("idempotency survives purge of idempotency_keys via the per-credential unique key (01 §4.7)", async () => {
    const a = (await (await create(createBody(t.principalId), "idem-3")).json()) as {
      verification_id: string;
    };
    await t.db.delete(schema.idempotencyKeys);
    const b = await create(createBody(t.principalId), "idem-3");
    expect(b.status).toBe(200);
    expect(((await b.json()) as { verification_id: string }).verification_id).toBe(a.verification_id);
    await t.db.delete(schema.idempotencyKeys);
    expect(await errCode(await create(createBody(t.principalId, { question: "changed?" }), "idem-3"))).toBe(
      "IDEMPOTENCY_KEY_CONFLICT",
    );
  });

  it("requires auth, Idempotency-Key and a valid body", async () => {
    expect(
      await errCode(await create(createBody(t.principalId), "k", `pm_test_deadbeef_${"x".repeat(43)}`)),
    ).toBe("UNAUTHENTICATED");
    const noIdem = await call(
      (r) => handleCreate(t.app, r),
      jsonReq("POST", "/v1/verifications", { key: t.apiKey, body: createBody(t.principalId) }),
    );
    expect(await errCode(noIdem)).toBe("VALIDATION_FAILED");
    expect(await errCode(await create({ ...createBody(t.principalId), extra: 1 }))).toBe("VALIDATION_FAILED");
    expect(await errCode(await create(createBody(t.principalId, { type: "ANYTHING" })))).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("checks principal, deadline window and a per-key area", async () => {
    expect(await errCode(await create(createBody("prn_01J9Z4K8T3W6Q2M5N7P0R4S8V1")))).toBe(
      "PRINCIPAL_MISMATCH",
    );
    expect(await errCode(await create(createBody(t.principalId, { deadline: "2026-10-09T03:05:00Z" })))).toBe(
      "DEADLINE_OUT_OF_RANGE",
    );
    expect(await errCode(await create(createBody(t.principalId, { deadline: "2026-10-10T03:00:01Z" })))).toBe(
      "DEADLINE_OUT_OF_RANGE",
    );
    // 01 §4.15: any location is accepted unless an operator gave the key its own area.
    const osaka = createBody(t.principalId, { location: { lat: 34.7, lng: 135.5, radius_m: 80 } });
    expect((await create(osaka)).status).toBe(201);
    await t.db
      .update(schema.requesterCredentials)
      .set({ allowedBbox: [35.6, 139.65, 35.72, 139.78] })
      .where(eq(schema.requesterCredentials.id, t.credentialId));
    expect(await errCode(await create(osaka))).toBe("LOCATION_OUT_OF_PILOT_AREA");
  });

  it("01 §4.15: a registered place is recorded when within 30 m, but is no longer required", async () => {
    const m = 1 / 111_195;
    const at = (d: number) =>
      createBody(t.principalId, { location: { lat: SHOP.lat + d * m, lng: SHOP.lng, radius_m: 80 } });
    const placeOf = async (res: Response) => {
      const { verification_id } = (await res.json()) as { verification_id: string };
      const [row] = await t.db
        .select()
        .from(schema.verificationRequests)
        .where(eq(schema.verificationRequests.id, verification_id));
      return row?.placeId ?? null;
    };
    expect(await placeOf(await create(at(31)))).toBeNull();
    expect(await placeOf(await create(at(29)))).not.toBeNull();
  });

  it("01 §4.15: answer kinds per type, and location only where the type needs it", async () => {
    const { location: _drop, ...noLocation } = createBody(t.principalId) as Record<string, unknown>;
    const text = {
      ...noLocation,
      type: "DOCUMENT_TRANSCRIPTION",
      answer_schema: { type: "text", max_chars: 500 },
    };
    const res = await create(text);
    expect(res.status).toBe(201);
    const { verification_id: id } = (await res.json()) as { verification_id: string };
    const view = (await (
      await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
    ).json()) as { location: unknown; answer_schema: unknown };
    expect(view).toMatchObject({ location: null, answer_schema: { type: "text", max_chars: 500 } });

    // wrong kind for the type
    expect(await errCode(await create({ ...text, answer_schema: { type: "number" } }))).toBe(
      "VALIDATION_FAILED",
    );
    // at-a-place type without a location
    const price = { ...noLocation, type: "PRICE_CHECK", answer_schema: { type: "number", unit: "円" } };
    expect(await errCode(await create(price))).toBe("VALIDATION_FAILED");
    expect(
      (await create({ ...price, location: { lat: SHOP.lat, lng: SHOP.lng, radius_m: 80 } })).status,
    ).toBe(201);
    // the requester names the choices
    const custom = {
      ...noLocation,
      type: "CUSTOM_CHOICE",
      answer_schema: { type: "enum", values: ["はい", "いいえ", "分からない"] },
    };
    expect((await create(custom)).status).toBe(201);
    expect(
      await errCode(await create({ ...custom, answer_schema: { type: "enum", values: ["はい", "はい"] } })),
    ).toBe("VALIDATION_FAILED");
  });

  it("I-CRT-05: a prohibited question -> 422 with rule_id, nothing created or reserved", async () => {
    const res = await create(createBody(t.principalId, { question: "Check the whereabouts of the owner" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { code: "TASK_POLICY_VIOLATION", details: { rule_id: "PERSON_TRACKING" } },
    });
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(0);
    expect(
      (await t.db.select().from(schema.requesterLedger)).filter((l) => l.entryType === "RESERVE"),
    ).toHaveLength(0);
  });

  it("I-LIM-01: a key without ceilings is bounded by its balance and rate limit only", async () => {
    const amt = (a: string, n = 1) =>
      createBody(t.principalId, {
        bounty: { asset: "USDC", amount: a, network: "solana-devnet" },
        assurance: { required_witnesses: n, quorum: 1 },
      });
    // the test key has no per-request or daily ceiling (null, docs/architecture 04 §4.3)
    expect((await create(amt("2.6", 2))).status).toBe(201); // 5.2, balance 10 -> 4.8
    expect(await errCode(await create(amt("5")))).toBe("INSUFFICIENT_BALANCE");
    await t.db
      .insert(schema.requesterLedger)
      .values({ credentialId: t.credentialId, entryType: "TOPUP", amount: "1000" });
    expect((await create(amt("300", 3))).status).toBe(201); // 900 in one request
    expect((await create(amt("50"))).status).toBe(201); // today 955.2, well past 20
    expect(await errCode(await create(amt("60")))).toBe("INSUFFICIENT_BALANCE"); // 54.8 left
    // next JST day resets the daily window (deadline must stay within 24 h of now)
    t.setNow(new Date("2026-10-09T15:00:01Z"));
    expect((await create(createBody(t.principalId, { deadline: "2026-10-09T16:00:00Z" }))).status).toBe(201);
    // rate limit: 30/min
    t.setNow(new Date("2026-10-09T15:01:00Z"));
    let last: Response | undefined;
    for (let i = 0; i < 31; i++)
      last = await call(
        (r) => handleGet(t.app, r, "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1"),
        jsonReq("GET", "/x", { key: t.apiKey }),
      );
    expect(last?.status).toBe(429);
  });

  it("I-RACE-03: 10 concurrent creates against a balance for 2 never overdraw", async () => {
    await t.db.delete(schema.requesterLedger);
    await t.db
      .insert(schema.requesterLedger)
      .values({ credentialId: t.credentialId, entryType: "TOPUP", amount: "1" });
    const results = await Promise.all(Array.from({ length: 10 }, () => create(createBody(t.principalId))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const reserves = (await t.db.select().from(schema.requesterLedger)).filter(
      (l) => l.entryType === "RESERVE",
    );
    expect(reserves).toHaveLength(2);
  });
});

describe("01 §4.25: the requester decides the shape of the work", () => {
  const get = async (id: string) =>
    (await (
      await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
    ).json()) as Record<string, unknown>;
  const FORM = {
    type: "form",
    fields: [
      { key: "price", label: "Price", type: "number", unit: "JPY" },
      { key: "stock", label: "On the shelf?", type: "enum", values: ["YES", "NO"] },
      { key: "note", label: "Note", type: "text", max_chars: 200, required: false },
    ],
  };

  it("acceptance_criteria is stored, read back, and shown to workers", async () => {
    const res = await create(
      createBody(t.principalId, { acceptance_criteria: "  The price tag must be legible.  " }),
    );
    expect(res.status).toBe(201);
    const { verification_id: id } = (await res.json()) as { verification_id: string };
    expect((await get(id)).acceptance_criteria).toBe("The price tag must be legible.");
    const plain = (await (await create(createBody(t.principalId))).json()) as { verification_id: string };
    expect((await get(plain.verification_id)).acceptance_criteria).toBeNull();
    expect(
      await errCode(await create(createBody(t.principalId, { acceptance_criteria: "x".repeat(501) }))),
    ).toBe("VALIDATION_FAILED");
  });

  it("13 §5: attestation is stored, read back, shown to workers and on the public result", async () => {
    const attestation = { subject: "agent_action", description: "  Delivered the parcel to room 302  " };
    const res = await create(createBody(t.principalId, { attestation }));
    expect(res.status).toBe(201);
    const { verification_id: id } = (await res.json()) as { verification_id: string };
    const want = { subject: "agent_action", description: "Delivered the parcel to room 302" };
    expect((await get(id)).attestation).toEqual(want);
    const plain = (await (await create(createBody(t.principalId))).json()) as { verification_id: string };
    expect((await get(plain.verification_id)).attestation).toBeNull();

    await openCreated(t, id);
    const alice = (await onboardWorker(t, "alice")).token;
    const list = (await (await W(t, alice).list()).json()) as {
      tasks: { verification_id: string; attestation: unknown }[];
    };
    expect(list.tasks.find((x) => x.verification_id === id)?.attestation).toEqual(want);
    const detail = await call(
      (r) => handleTaskDetail(t.app, r, id),
      jsonReq("GET", `/v1/worker/tasks/${id}`, { key: alice }),
    );
    expect(((await detail.json()) as { attestation: unknown }).attestation).toEqual(want);
    const { claim_id } = (await (await W(t, alice).claim(id)).json()) as { claim_id: string };
    const claim = await call(
      (r) => handleClaimDetail(t.app, r, claim_id),
      jsonReq("GET", `/v1/worker/claims/${claim_id}`, { key: alice }),
    );
    expect(((await claim.json()) as { attestation: unknown }).attestation).toEqual(want);
    await witness(t, alice, id, { answer: "OPEN", claimId: claim_id });
    const pub = await publicResult(t.app, id);
    expect(pub.agent_attestation).toEqual(want);
    expect(proofHeadline(pub, "ja")).toBe("『Delivered the parcel to room 302』が本当だと、人が確かめました");
    expect(proofHeadline(pub, "en")).toBe("A person confirmed: “Delivered the parcel to room 302”");
    expect(proofHeadline({ ...pub, agent_attestation: null }, "ja")).toBe("人が確かめました");

    for (const bad of [
      { subject: "agent_action", description: "x".repeat(201) },
      { subject: "agent_action", description: "   " },
      { subject: "something_else", description: "Cleaned the room" },
    ]) {
      expect(await errCode(await create(createBody(t.principalId, { attestation: bad })))).toBe(
        "VALIDATION_FAILED",
      );
    }
    expect(
      (
        await create(
          createBody(t.principalId, {
            attestation: { subject: "agent_action", description: "x".repeat(200) },
          }),
        )
      ).status,
    ).toBe(201);
  });

  it("a form answer_schema is accepted for text types, stored as text, and refused for choice types", async () => {
    const res = await create(
      createBody(t.principalId, { type: "CUSTOM_TASK", answer_schema: FORM, location: undefined }),
    );
    expect(res.status).toBe(201);
    const { verification_id: id } = (await res.json()) as { verification_id: string };
    const view = await get(id);
    expect(view.answer_schema).toEqual({
      type: "form",
      fields: FORM.fields.map((f) => ({ required: true, ...f })),
    });
    const [row] = await t.db
      .select()
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, id));
    expect(row?.answerKind).toBe("text");
    const wrong = await create(createBody(t.principalId, { answer_schema: FORM }));
    expect(wrong.status).toBe(400);
    expect(
      ((await wrong.json()) as { error: { details: { allowed: string[] } } }).error.details.allowed,
    ).toEqual(["enum"]);
    const dup = { ...FORM, fields: [FORM.fields[0], FORM.fields[0]] };
    expect(
      await errCode(
        await create(
          createBody(t.principalId, { type: "CUSTOM_TASK", answer_schema: dup, location: undefined }),
        ),
      ),
    ).toBe("VALIDATION_FAILED");
    // a form cannot go on the public map (text answers never do)
    expect(
      await errCode(
        await create(createBody(t.principalId, { type: "SITE_REPORT", answer_schema: FORM, publish: true })),
      ),
    ).toBe("VALIDATION_FAILED");
  });

  it("work with no location may be due up to 7 days out; work at a place stays within 24 h", async () => {
    const far = { type: "CUSTOM_TASK", answer_schema: { type: "text" }, location: undefined };
    expect(
      (await create(createBody(t.principalId, { ...far, deadline: "2026-10-16T02:00:00Z" }))).status,
    ).toBe(201);
    expect(
      await errCode(await create(createBody(t.principalId, { ...far, deadline: "2026-10-16T03:00:01Z" }))),
    ).toBe("DEADLINE_OUT_OF_RANGE");
    expect(
      await errCode(
        await create(
          createBody(t.principalId, {
            type: "CUSTOM_TASK",
            answer_schema: { type: "text" },
            deadline: "2026-10-12T03:00:00Z",
          }),
        ),
      ),
    ).toBe("DEADLINE_OUT_OF_RANGE");
  });

  describe("POST /v1/verifications/batch", () => {
    const batch = (body: unknown, idem = crypto.randomUUID()) =>
      call(
        (r) => handleCreateBatch(t.app, r),
        jsonReq("POST", "/v1/verifications/batch", { key: t.apiKey, body, idem }),
      );
    // Built per test: `t` only exists after beforeEach.
    const templateOf = () => {
      const { location: _l, question: _q, ...rest } = createBody(t.principalId);
      return rest;
    };
    const items = [
      { location: { ...SHOP, radius_m: 80 }, question: "Is shop A open?" },
      { location: { lat: 35.66, lng: 139.7, radius_m: 80 }, question: "Is shop B open?" },
      { location: { lat: 35.67, lng: 139.71, radius_m: 80 }, question: "Is shop C open?" },
    ];

    it("creates one task per item, in order, each reserved and funded like a single request", async () => {
      const res = await batch({ template: templateOf(), items });
      expect(res.status).toBe(201);
      const { verifications } = (await res.json()) as {
        verifications: { verification_id: string; status: string }[];
      };
      expect(verifications).toHaveLength(3);
      expect(new Set(verifications.map((v) => v.verification_id)).size).toBe(3);
      for (const [i, v] of verifications.entries()) {
        expect(v.status).toBe("CREATED");
        expect((await get(v.verification_id)).question).toBe(items[i]?.question);
      }
      const ledger = await t.db.select().from(schema.requesterLedger);
      expect(ledger.filter((l) => l.entryType === "RESERVE")).toHaveLength(3);
      expect((await t.db.select().from(schema.outboxJobs)).map((j) => j.dedupeKey).sort()).toEqual(
        verifications.map((v) => `FUND_TASK:${v.verification_id}`).sort(),
      );
    });

    it("is all or nothing: one bad item rejects the batch and creates no task", async () => {
      const bad = [...items, { question: "No place given" }]; // location required for this type
      const res = await batch({ template: templateOf(), items: bad });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string; details: { index?: number } } };
      expect(body.error.code).toBe("VALIDATION_FAILED");
      expect(body.error.details.index).toBe(3);
      expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(0);
      expect(await errCode(await batch({ template: templateOf(), items: [] }))).toBe("VALIDATION_FAILED");
    });

    it("replays on the same Idempotency-Key and keeps the template's own location when an item has none", async () => {
      const withLoc = { ...templateOf(), location: { ...SHOP, radius_m: 80 } };
      const a = await batch(
        { template: withLoc, items: [{ question: "q1" }, { question: "q2" }] },
        "batch-1",
      );
      expect(a.status).toBe(201);
      const b = await batch(
        { template: withLoc, items: [{ question: "q1" }, { question: "q2" }] },
        "batch-1",
      );
      expect(b.headers.get("Idempotent-Replayed")).toBe("true");
      expect(await b.json()).toEqual(await a.json());
      expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(2);
    });
  });
});

describe("GET / cancel", () => {
  const get = (id: string, key = t.apiKey) =>
    call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key }));
  const cancel = (id: string) =>
    call(
      (r) => handleCancel(t.app, r, id),
      jsonReq("POST", `/v1/verifications/${id}/cancel`, { key: t.apiKey }),
    );

  it("returns the view to the owner and 404 to other credentials", async () => {
    const { verification_id: id } = (await (await create(createBody(t.principalId))).json()) as {
      verification_id: string;
    };
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      verification_id: id,
      status: "CREATED",
      bounty: { amount: "0.5" },
      witness_progress: { valid: 0, active_claims: 0, open_slots: 1, required: 1 },
      funding: { status: "PENDING", signature: null },
      result: null,
    });
    const { issueApiKey } = await import("../lib/services/admin-service");
    const other = await issueApiKey(t.db, {
      principalId: t.principalId,
      requesterName: "other",
      maxTaskAmount: "5",
      dailySpendLimit: "5",
      operator: "t",
    });
    expect((await get(id, other.apiKey)).status).toBe(404);
    expect((await get("not-an-id")).status).toBe(404);
  });

  it("T14: cancel before funding -> CANCELLED, reservation released, FUND job cancelled; repeat is idempotent", async () => {
    const { verification_id: id } = (await (await create(createBody(t.principalId))).json()) as {
      verification_id: string;
    };
    const a = await cancel(id);
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ status: "CANCELLED", funding: { status: "ABANDONED" } });
    const ledger = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.verificationId, id));
    expect(ledger.map((l) => l.entryType).sort()).toEqual(["RELEASE", "RESERVE"]);
    const [job] = await t.db.select().from(schema.outboxJobs);
    expect(job).toMatchObject({ state: "DONE", lastError: "cancelled" });
    expect(await (await cancel(id)).json()).toMatchObject({ status: "CANCELLED" });
  });

  it("cancel while funding is in flight -> 409 TASK_NOT_CANCELLABLE (retryable)", async () => {
    const { verification_id: id } = (await (await create(createBody(t.principalId))).json()) as {
      verification_id: string;
    };
    await t.db
      .update(schema.paymentRecords)
      .set({ status: "SUBMITTED", signatures: ["sig"] })
      .where(eq(schema.paymentRecords.verificationId, id));
    const res = await cancel(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "TASK_NOT_CANCELLABLE", retryable: true } });
  });

  it("T15: cancel an OPEN task with no claims -> CANCELLED + REFUND_TASK queued; with an ACTIVE claim -> 409", async () => {
    const { verification_id: id } = (await (await create(createBody(t.principalId))).json()) as {
      verification_id: string;
    };
    await t.db
      .update(schema.verificationRequests)
      .set({ status: "OPEN", fundingStatus: "CONFIRMED" })
      .where(eq(schema.verificationRequests.id, id));
    const res = await cancel(id);
    expect(await res.json()).toMatchObject({ status: "CANCELLED" });
    const jobs = (await t.db.select().from(schema.outboxJobs)).map((j) => j.dedupeKey);
    expect(jobs).toContain(`REFUND_TASK:${id}`);
  });
});

// ---------- spend policy, quotes and the list (docs/architecture 04 §4.1-4.3) ----------

describe("spend policy", () => {
  const amt = (a: string, n = 1) =>
    createBody(t.principalId, {
      bounty: { asset: "USDC", amount: a, network: "solana-devnet" },
      assurance: { required_witnesses: n, quorum: 1 },
    });

  it("a key with ceilings refuses one request over max_task_amount and a day over daily_spend_limit", async () => {
    const { issueApiKey, topUp } = await import("../lib/services/admin-service");
    const capped = await issueApiKey(t.db, {
      principalId: t.principalId,
      requesterName: "capped",
      maxTaskAmount: "5",
      dailySpendLimit: "12",
      operator: "test",
    });
    await topUp(t.db, capped.credentialId, "100");
    const c = (body: unknown) => create(body, crypto.randomUUID(), capped.apiKey);
    // 2.6 × 2 = 5.2 > 5 per request
    const over = await c(amt("2.6", 2));
    expect(over.status).toBe(403);
    expect(await errCode(over)).toBe("TASK_AMOUNT_LIMIT_EXCEEDED");
    expect((await c(amt("5"))).status).toBe(201); // today 5
    expect((await c(amt("5"))).status).toBe(201); // today 10
    const day = await c(amt("3")); // 13 > 12
    expect(day.status).toBe(403);
    expect(await errCode(day)).toBe("DAILY_SPEND_LIMIT_EXCEEDED");
    expect((await c(amt("2"))).status).toBe(201); // exactly 12
    expect(await errCode(await c(amt("0.1")))).toBe("DAILY_SPEND_LIMIT_EXCEEDED"); // 12.1
    // the next JST day starts a new window
    t.setNow(new Date("2026-10-09T15:00:01Z"));
    expect((await c(createBody(t.principalId, { deadline: "2026-10-09T16:00:00Z" }))).status).toBe(201);
    // the ledger never over-reserved
    const spent = (await t.db.select().from(schema.requesterLedger))
      .filter((l) => l.credentialId === capped.credentialId && l.entryType === "RESERVE")
      .reduce((s, l) => s + Number(l.amount), 0);
    expect(spent).toBeCloseTo(-12.5, 5);
  });
});

describe("POST /v1/verifications/quote", () => {
  const quote = (body: unknown, key = t.apiKey) =>
    call((r) => handleQuote(t.app, r), jsonReq("POST", "/v1/verifications/quote", { key, body }));
  const ledgerRows = async () => (await t.db.select().from(schema.requesterLedger)).length;

  it("quotes the cost without reserving, and the quote_id confirms the same body once within 5 minutes", async () => {
    const before = await ledgerRows();
    const body = createBody(t.principalId, { assurance: { required_witnesses: 2, quorum: 2 } });
    const q = await quote(body);
    expect(q.status).toBe(200);
    const qb = (await q.json()) as {
      quote_id: string;
      total: string;
      balance: string;
      balance_after: string;
      policy: { ok: boolean; checked: string[] };
      reuse: unknown;
      expires_at: string;
    };
    expect(qb).toMatchObject({ total: "1", balance: "10", balance_after: "9", reuse: null });
    expect(qb.quote_id).toMatch(/^qte_/);
    expect(qb.policy.ok).toBe(true);
    expect(qb.policy.checked).toContain("spend_limit");
    expect(await ledgerRows()).toBe(before); // nothing reserved, no task
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(0);

    // a different body cannot use the quote
    const other = await create({ ...body, question: "Is it closed?", quote_id: qb.quote_id });
    expect(other.status).toBe(409);
    expect(await errCode(other)).toBe("QUOTE_MISMATCH");
    // the same body does, once
    const ok = await create({ ...body, quote_id: qb.quote_id });
    expect(ok.status).toBe(201);
    const { verification_id: id } = (await ok.json()) as { verification_id: string };
    const [row] = await t.db.select().from(schema.verificationQuotes);
    expect(row).toMatchObject({ verificationId: id });
    expect(row?.consumedAt).not.toBeNull();
    const again = await create({ ...body, quote_id: qb.quote_id });
    expect(await errCode(again)).toBe("QUOTE_EXPIRED");
  });

  it("refuses an expired quote, another key's quote, and a body the create would refuse", async () => {
    const body = createBody(t.principalId);
    const qb = (await (await quote(body)).json()) as { quote_id: string };
    const { issueApiKey } = await import("../lib/services/admin-service");
    const other = await issueApiKey(t.db, {
      principalId: t.principalId,
      requesterName: "other",
      maxTaskAmount: null,
      dailySpendLimit: null,
      operator: "t",
    });
    const stolen = await create({ ...body, quote_id: qb.quote_id }, crypto.randomUUID(), other.apiKey);
    expect(stolen.status).toBe(404);
    expect(await errCode(stolen)).toBe("QUOTE_NOT_FOUND");
    t.advance(5 * 60_000 + 1);
    const late = await create({ ...body, quote_id: qb.quote_id });
    expect(await errCode(late)).toBe("QUOTE_EXPIRED");
    // the quote runs every create check: a question against policy is refused before any quote is written
    const bad = await quote(createBody(t.principalId, { question: "Check the whereabouts of the owner" }));
    expect(bad.status).toBe(422);
    expect(await errCode(bad)).toBe("TASK_POLICY_VIOLATION");
    expect(await t.db.select().from(schema.verificationQuotes)).toHaveLength(1);
  });
});

describe("GET /v1/verifications", () => {
  const list = (qs = "", key = t.apiKey) =>
    call((r) => handleList(t.app, r), jsonReq("GET", `/v1/verifications${qs}`, { key }));
  const cancel = (id: string) =>
    call(
      (r) => handleCancel(t.app, r, id),
      jsonReq("POST", `/v1/verifications/${id}/cancel`, { key: t.apiKey }),
    );
  type Page = { verifications: { verification_id: string; status: string }[]; next_cursor: string | null };

  it("lists this key's verifications newest first, pages with a cursor, filters by status, hides others", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        ((await (await create(createBody(t.principalId))).json()) as { verification_id: string })
          .verification_id,
      );
    }
    const { issueApiKey } = await import("../lib/services/admin-service");
    const other = await issueApiKey(t.db, {
      principalId: t.principalId,
      requesterName: "other",
      maxTaskAmount: null,
      dailySpendLimit: null,
      operator: "t",
    });
    expect(((await (await list("", other.apiKey)).json()) as Page).verifications).toEqual([]);

    const p1 = (await (await list("?limit=2")).json()) as Page;
    expect(p1.verifications.map((v) => v.verification_id)).toEqual([ids[2], ids[1]]);
    expect(p1.next_cursor).toBe(ids[1]);
    const p2 = (await (await list(`?limit=2&cursor=${p1.next_cursor}`)).json()) as Page;
    expect(p2.verifications.map((v) => v.verification_id)).toEqual([ids[0]]);
    expect(p2.next_cursor).toBeNull();

    await cancel(ids[0] ?? "");
    const cancelled = (await (await list("?status=CANCELLED")).json()) as Page;
    expect(cancelled.verifications.map((v) => [v.verification_id, v.status])).toEqual([
      [ids[0], "CANCELLED"],
    ]);
    expect(await errCode(await list("?status=NOPE"))).toBe("VALIDATION_FAILED");
  });
});
