// Outbox jobs + tick over PGlite and a fake chain (09 §3.3: I-FLOW-01/04, I-RPC-01/02, I-IDEM-03, I-FUND-01,
// I-SET-02/05, I-OUT-01) and operator actions (08 §6).
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleSetFlag, handleSuspendWorker, handleTick } from "../lib/handlers/operator";
import { handleCreate, handleGet } from "../lib/handlers/requester";
import { leaseNextJob, tick } from "../lib/services/jobs";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, W, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
});

// biome-ignore lint/suspicious/noExplicitAny: test convenience
const view = async (id: string): Promise<any> =>
  (
    await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
  ).json();
const create = async (o: Record<string, unknown> = {}) => {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
  return ((await res.json()) as { verification_id: string }).verification_id;
};
const balance = async () =>
  (
    await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.credentialId, t.credentialId))
  ).reduce((a, l) => a + Number(l.amount), 0);
const ledger = async (id: string) =>
  (await t.db.select().from(schema.requesterLedger).where(eq(schema.requesterLedger.verificationId, id)))
    .map((l) => `${l.entryType}:${Number(l.amount)}`)
    .sort();
const jobs = async () => t.db.select().from(schema.outboxJobs);

describe("chain jobs", () => {
  it("I-FLOW-01: create -> FUND -> OPEN -> witness -> VERIFIED -> settle -> SETTLED with signatures", async () => {
    const id = await create();
    await tick(t.app);
    const v1 = await view(id);
    expect(v1).toMatchObject({ status: "OPEN", funding: { status: "CONFIRMED" } });
    expect(v1.funding.explorer_url).toContain("cluster=devnet");
    await witness(t, alice, id);
    expect((await view(id)).status).toBe("VERIFIED");
    await tick(t.app);
    const v = await view(id);
    expect(v.status).toBe("SETTLED");
    expect(v.result.settlement).toMatchObject({ status: "SETTLED", paid: [{ amount: "0.5" }] });
    expect(v.result.attestation).toMatchObject({ network: "solana-devnet" });
    expect(v.result.attestation.signature).toBe(v.result.settlement.signature);
    expect(await ledger(id)).toEqual(["RESERVE:-0.5"]); // all paid, no credit-back
    expect(t.chain.sent.map((s) => s.op)).toEqual(["fund", "settle"]);
  });

  it("I-FLOW-04: nobody comes -> EXPIRED -> refund -> REFUNDED, balance restored", async () => {
    const before = await balance();
    const id = await create();
    await tick(t.app);
    t.advance(3_600_000);
    await tick(t.app);
    const v = await view(id);
    expect(v).toMatchObject({
      status: "REFUNDED",
      result: { status: "EXPIRED", reason: "INSUFFICIENT_WITNESSES" },
    });
    expect(await balance()).toBe(before);
    expect(await ledger(id)).toEqual(["REFUND:0.5", "RESERVE:-0.5"]);
  });

  it("T18: 2 witnesses required, 1 valid at deadline -> EXPIRED, that witness paid, remainder released", async () => {
    const id = await create({ assurance: { required_witnesses: 2, quorum: 2 } });
    await tick(t.app);
    await witness(t, alice, id);
    t.advance(3_600_000);
    await tick(t.app); // deadline -> T11
    await tick(t.app); // settle job
    const v = await view(id);
    expect(v.status).toBe("EXPIRED");
    expect(v.result).toMatchObject({
      status: "EXPIRED",
      settlement: { status: "SETTLED", paid: [{ amount: "0.5" }] },
    });
    expect(await ledger(id)).toEqual(["RELEASE:0.5", "RESERVE:-1"]);
  });

  it("I-RPC-01: RPC down at settle -> VERIFIED + settlement FAILED_RETRYING, never SETTLED; recovers later", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    t.chain.modes.push("retry");
    await tick(t.app);
    const v = await view(id);
    expect(v.status).toBe("VERIFIED");
    expect(v.result.settlement.status).toBe("FAILED_RETRYING");
    const [job] = (await jobs()).filter((j) => j.kind === "FINALIZE_AND_SETTLE");
    expect(job).toMatchObject({ state: "PENDING" });
    t.advance(60_000);
    await tick(t.app);
    expect((await view(id)).status).toBe("SETTLED");
  });

  it("I-SET-02: running FINALIZE_AND_SETTLE twice sends one settle", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    await tick(t.app);
    await t.db
      .update(schema.outboxJobs)
      .set({ state: "PENDING", runAfter: t.app.now() })
      .where(eq(schema.outboxJobs.dedupeKey, `FINALIZE_AND_SETTLE:${id}`));
    await tick(t.app);
    expect(t.chain.sent.filter((s) => s.op === "settle")).toHaveLength(1);
  });

  it("I-SET-05: on-chain Finalized with different recipients -> settle not sent, job DEAD", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    const [task] = await t.db
      .select()
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, id));
    const onChain = t.chain.tasks.get(Buffer.from(task?.taskIdHash ?? []).toString("hex"));
    if (onChain) Object.assign(onChain, { status: "Finalized", recipients: ["Attacker111"] });
    for (let i = 0; i < 2; i++) await tick(t.app);
    expect(t.chain.sent.filter((s) => s.op === "settle")).toHaveLength(0);
    expect((await jobs()).find((j) => j.kind === "FINALIZE_AND_SETTLE")).toMatchObject({ state: "DEAD" });
    expect((await view(id)).status).toBe("VERIFIED");
  });

  it("I-IDEM-03 / I-FUND-01: funding tx landed but confirmation timed out -> next run sees the PDA, no second send", async () => {
    const id = await create();
    t.chain.modes.push("land-but-timeout");
    await tick(t.app);
    expect((await view(id)).status).toBe("CREATED");
    t.advance(60_000);
    await tick(t.app);
    expect((await view(id)).status).toBe("OPEN");
    expect(t.chain.sent.filter((s) => s.op === "fund")).toHaveLength(1);
  });

  it("T16: funding never lands before the deadline -> CANCELLED (FUNDING_FAILED), reservation released", async () => {
    const before = await balance();
    const id = await create();
    t.chain.modes.push("retry");
    await tick(t.app);
    t.advance(3_600_000);
    t.chain.modes.push("retry");
    await t.db.update(schema.outboxJobs).set({ runAfter: t.app.now() });
    await tick(t.app);
    const v = await view(id);
    expect(v.status).toBe("CANCELLED");
    expect(await balance()).toBe(before);
    const [task] = await t.db
      .select()
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, id));
    expect(task?.statusReason).toBe("FUNDING_FAILED");
  });

  it("I-OUT-01: a RUNNING job whose lease expired is picked up again", async () => {
    await create();
    const job = await leaseNextJob(t.app, "crashed-runner");
    expect(job?.kind).toBe("FUND_TASK");
    expect(await leaseNextJob(t.app, "other")).toBeNull(); // still leased
    t.advance(181_000);
    expect((await leaseNextJob(t.app, "other"))?.id).toBe(job?.id);
  });

  it("settlement kill switch pauses settle without losing the result", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    const res = await call(
      (r) => handleSetFlag(t.app, { adminToken: "a".repeat(32), cronSecret: "c".repeat(32) }, r),
      jsonReq("POST", "/v1/admin/flags", {
        key: "a".repeat(32),
        body: { key: "settlement_enabled", value: false },
      }),
    );
    expect(res.status).toBe(200);
    await tick(t.app);
    expect((await view(id)).status).toBe("VERIFIED");
    await call(
      (r) => handleSetFlag(t.app, { adminToken: "a".repeat(32), cronSecret: "c".repeat(32) }, r),
      jsonReq("POST", "/v1/admin/flags", {
        key: "a".repeat(32),
        body: { key: "settlement_enabled", value: true },
      }),
    );
    t.advance(61_000);
    await tick(t.app);
    expect((await view(id)).status).toBe("SETTLED");
  });

  it("claims kill switch and worker suspension", async () => {
    const id = await create();
    await tick(t.app);
    const secrets = { adminToken: "a".repeat(32), cronSecret: "c".repeat(32) };
    await call(
      (r) => handleSetFlag(t.app, secrets, r),
      jsonReq("POST", "/x", { key: secrets.adminToken, body: { key: "claims_enabled", value: false } }),
    );
    expect((await W(t, alice).claim(id)).status).toBe(409);
    await call(
      (r) => handleSetFlag(t.app, secrets, r),
      jsonReq("POST", "/x", { key: secrets.adminToken, body: { key: "claims_enabled", value: true } }),
    );
    const [bobRow] = await t.db.select().from(schema.workers).where(eq(schema.workers.privyUserId, "bob"));
    expect((await W(t, bob).claim(id)).status).toBe(201);
    await call(
      (r) => handleSuspendWorker(t.app, secrets, r, bobRow?.id ?? ""),
      jsonReq("POST", "/x", { key: secrets.adminToken }),
    );
    const [claim] = await t.db.select().from(schema.claims);
    expect(claim?.state).toBe("EXPIRED");
    expect((await W(t, bob).list()).status).toBe(403);
    const unauth = await call(
      (r) => handleSetFlag(t.app, secrets, r),
      jsonReq("POST", "/x", { key: "wrong", body: { key: "claims_enabled", value: false } }),
    );
    expect(unauth.status).toBe(401);
  });

  it("tick requires the cron secret; expires stale claims, challenges and uploads", async () => {
    const secrets = { adminToken: "a".repeat(32), cronSecret: "c".repeat(32) };
    expect(
      (await call((r) => handleTick(t.app, secrets, r), jsonReq("POST", "/api/internal/tick"))).status,
    ).toBe(401);
    const id = await create({ deadline: "2026-10-09T06:00:00Z" });
    await tick(t.app);
    const c = (await (await W(t, alice).claim(id)).json()) as {
      claim_id: string;
      challenge: { challenge_id: string };
    };
    await W(t, alice).upload(c.claim_id, c.challenge.challenge_id);
    t.advance(61 * 60_000); // claim TTL 30 min, upload discard 60 min
    const ok = await call(
      (r) => handleTick(t.app, secrets, r),
      jsonReq("POST", "/api/internal/tick", { headers: { "x-internal-secret": secrets.cronSecret } }),
    );
    expect(ok.status).toBe(200);
    expect((await t.db.select().from(schema.claims))[0]?.state).toBe("EXPIRED");
    expect((await t.db.select().from(schema.challenges))[0]?.state).toBe("EXPIRED");
    expect((await t.db.select().from(schema.uploads))[0]?.state).toBe("DISCARDED");
  });

  it("purge removes photos, EXIF and coordinates after 30 days but keeps hashes", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    expect(t.storage.raw.size).toBe(1);
    t.advance(31 * 86_400_000);
    await tick(t.app);
    const [ev] = await t.db.select().from(schema.evidenceObjects);
    expect(ev).toMatchObject({ rawObjectKey: null, derivedObjectKey: null, rawMetadataEnc: null });
    expect(ev?.sha256.length).toBe(32);
    expect(t.storage.raw.size + t.storage.derived.size).toBe(0);
    const [loc] = await t.db.select().from(schema.locationObservations);
    expect(loc?.coordsEnc).toBeNull();
  });
});
