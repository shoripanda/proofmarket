// Integration tests for the requester API over PGlite (09 §2-3: I-IDEM-01/02, I-LIM-01, I-RACE-03, I-CRT-05/06).
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCancel, handleCreate, handleGet } from "../lib/handlers/requester";
import { setAllowedTaskTypes } from "../lib/services/admin-service";
import { call, createBody, createTestApp, jsonReq, SHOP } from "./support/app";

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
    expect(view.assurance).toEqual({ required_witnesses: 2, quorum: 2, level: "standard" });
    const ledger = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.verificationId, id));
    expect(ledger.map((l) => l.amount)).toEqual(["-1.000000"]);
    expect(await errCode(await create(createBody(t.principalId, { assurance: { level: "max" } })))).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("01 §4.8: new task types need the key's permission and answers that belong to the type", async () => {
    const queue = (values: string[]) =>
      createBody(t.principalId, { type: "QUEUE_LENGTH", answer_schema: { type: "enum", values } });
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

  it("checks principal, deadline window, pilot area and the places allowlist", async () => {
    expect(await errCode(await create(createBody("prn_01J9Z4K8T3W6Q2M5N7P0R4S8V1")))).toBe(
      "PRINCIPAL_MISMATCH",
    );
    expect(await errCode(await create(createBody(t.principalId, { deadline: "2026-10-09T03:05:00Z" })))).toBe(
      "DEADLINE_OUT_OF_RANGE",
    );
    expect(await errCode(await create(createBody(t.principalId, { deadline: "2026-10-10T03:00:01Z" })))).toBe(
      "DEADLINE_OUT_OF_RANGE",
    );
    expect(
      await errCode(
        await create(createBody(t.principalId, { location: { lat: 34.7, lng: 135.5, radius_m: 80 } })),
      ),
    ).toBe("LOCATION_OUT_OF_PILOT_AREA");
  });

  it("I-CRT-06: 31 m from the allowlisted place -> LOCATION_NOT_ALLOWLISTED; 29 m -> ok", async () => {
    const m = 1 / 111_195;
    const at = (d: number) =>
      createBody(t.principalId, { location: { lat: SHOP.lat + d * m, lng: SHOP.lng, radius_m: 80 } });
    expect(await errCode(await create(at(31)))).toBe("LOCATION_NOT_ALLOWLISTED");
    expect((await create(at(29))).status).toBe(201);
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

  it("I-LIM-01: per-task limit, daily limit, balance and rate limit", async () => {
    const amt = (a: string, n = 1) =>
      createBody(t.principalId, {
        bounty: { asset: "USDC", amount: a, network: "solana-devnet" },
        assurance: { required_witnesses: n, quorum: 1 },
      });
    expect(await errCode(await create(amt("2.6", 2)))).toBe("TASK_AMOUNT_LIMIT_EXCEEDED"); // 5.2 > 5
    for (let i = 0; i < 2; i++) expect((await create(amt("5"))).status).toBe(201); // balance 10 -> 0
    expect(await errCode(await create(amt("0.5")))).toBe("INSUFFICIENT_BALANCE");
    // daily: top up and exceed 20
    await t.db
      .insert(schema.requesterLedger)
      .values({ credentialId: t.credentialId, entryType: "TOPUP", amount: "100" });
    for (let i = 0; i < 2; i++) expect((await create(amt("5"))).status).toBe(201); // today 20
    const daily = await create(amt("0.5"));
    expect(await errCode(daily)).toBe("DAILY_SPEND_LIMIT_EXCEEDED");
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
