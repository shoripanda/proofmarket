// Sign-ups from /join (04 §3.20): encrypted contact, validation, rate limit, 90-day deletion.
import { schema } from "@proofmarket/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createParticipationRequest,
  listParticipationRequests,
  setParticipationStatus,
} from "../lib/services/participation-service";
import { createRemovalRequest, listRemovalRequests, setRemovalStatus } from "../lib/services/removal-service";
import { purgeExpiredEvidence } from "../lib/services/retention";
import { createTestApp } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});
const ok = { role: "worker", email: "Alice@Example.com", area: "shibuya", consent: true };
const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe("participation requests", () => {
  it("stores the address encrypted; the operator list decrypts it", async () => {
    await createParticipationRequest(t.app, ok, "1.2.3.4");
    const [row] = await t.db.select().from(schema.participationRequests);
    expect(row?.contactEnc.toString("utf8")).not.toContain("example.com");
    expect(row?.area).toBe("shibuya");
    const list = await listParticipationRequests(t.db, t.app.config.locationEncKey);
    expect(list).toMatchObject([{ role: "worker", email: "alice@example.com", area: "shibuya" }]);
    await setParticipationStatus(t.db, list[0]?.id ?? "", "contacted");
    expect(await listParticipationRequests(t.db, t.app.config.locationEncKey)).toEqual([]);
  });

  it("requires consent and a valid address, drops area for requesters, rejects the honeypot", async () => {
    expect(await err(createParticipationRequest(t.app, { ...ok, consent: false }, "ip"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await err(createParticipationRequest(t.app, { ...ok, email: "nope" }, "ip"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await err(createParticipationRequest(t.app, { ...ok, website: "x" }, "ip"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await err(createParticipationRequest(t.app, { ...ok, lat: 35.6 }, "ip"))).toBe(
      "VALIDATION_FAILED",
    );
    await createParticipationRequest(t.app, { ...ok, role: "requester" }, "ip2");
    const [row] = await t.db.select().from(schema.participationRequests);
    expect(row?.area).toBeNull();
  });

  it("limits each IP to 5 per minute", async () => {
    for (let i = 0; i < 5; i++) await createParticipationRequest(t.app, ok, "9.9.9.9");
    expect(await err(createParticipationRequest(t.app, ok, "9.9.9.9"))).toBe("RATE_LIMITED");
    expect(await err(createParticipationRequest(t.app, ok, "8.8.8.8"))).toBeNull();
  });

  it("the daily purge deletes requests older than 90 days", async () => {
    await createParticipationRequest(t.app, ok, "ip");
    t.advance(89 * 86_400_000);
    expect((await purgeExpiredEvidence(t.app)).participation).toBe(0);
    t.advance(2 * 86_400_000);
    expect((await purgeExpiredEvidence(t.app)).participation).toBe(1);
    expect(await t.db.select().from(schema.participationRequests)).toEqual([]);
  });
});

describe("removal requests", () => {
  const base = {
    email: "Shop@Example.com",
    reason: "店の写真を消してください",
    verification_id: "ver_01ABC",
  };
  it("stores the address encrypted and lists it for the operator", async () => {
    await createRemovalRequest(t.app, base, "ip");
    const [row] = await t.db.select().from(schema.removalRequests);
    expect(row?.contactEnc.toString("utf8")).not.toContain("example.com");
    const list = await listRemovalRequests(t.db, t.app.config.locationEncKey);
    expect(list).toMatchObject([{ email: "shop@example.com", verification_id: "ver_01ABC" }]);
    await setRemovalStatus(t.db, list[0]?.id ?? "", "handled");
    expect(await listRemovalRequests(t.db, t.app.config.locationEncKey)).toEqual([]);
  });

  it("needs a reason, rejects odd IDs, and is kept for a year", async () => {
    expect(await err(createRemovalRequest(t.app, { ...base, reason: " " }, "ip"))).toBe("VALIDATION_FAILED");
    expect(await err(createRemovalRequest(t.app, { ...base, verification_id: "x;drop" }, "ip"))).toBe(
      "VALIDATION_FAILED",
    );
    await createRemovalRequest(t.app, base, "ip");
    t.advance(364 * 86_400_000);
    expect((await purgeExpiredEvidence(t.app)).removal).toBe(0);
    t.advance(2 * 86_400_000);
    expect((await purgeExpiredEvidence(t.app)).removal).toBe(1);
  });
});
