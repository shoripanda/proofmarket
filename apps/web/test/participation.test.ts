// Sign-ups from /join (04 §3.20): encrypted contact, validation, rate limit, 90-day deletion.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createResendMailer } from "../lib/adapters/resend-mailer";
import { authenticateApiKey } from "../lib/auth/requester";
import {
  createParticipationRequest,
  KEYS_PER_IP_PER_DAY,
  listParticipationRequests,
  setParticipationStatus,
} from "../lib/services/participation-service";
import { createRemovalRequest, listRemovalRequests, setRemovalStatus } from "../lib/services/removal-service";
import { purgeExpiredEvidence } from "../lib/services/retention";
import { createTestApp } from "./support/app";
import { FakeMailer } from "./support/fakes";

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

describe("requester sign-up -> API key on the spot (01 §4.28)", () => {
  const req = { role: "requester", email: "Agent@Example.com", consent: true, lang: "en" };
  const credentials = async () => (await t.db.select().from(schema.requesterCredentials)).length;
  const issue = async (ip = "ip") => {
    const r = await createParticipationRequest(t.app, req, ip);
    if (r.delivery !== "screen") throw new Error("expected a key");
    return r;
  };

  it("returns a working key with the trial balance; only its hash is stored", async () => {
    const before = await credentials();
    const r = await issue();
    expect(r).toMatchObject({ ok: true, delivery: "screen", trial_balance: "5", emailed: false });
    const auth = await authenticateApiKey(t.app, r.api_key);
    expect(r.principal_ref).toBe(auth.principalId);
    const ledger = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.credentialId, auth.credentialId));
    expect(ledger).toMatchObject([{ entryType: "TOPUP" }]);
    expect(Number(ledger[0]?.amount)).toBe(5);
    expect(await credentials()).toBe(before + 1);
    const [row] = await t.db.select().from(schema.participationRequests);
    expect(row).toMatchObject({ status: "contacted", credentialId: auth.credentialId });
    expect(await listParticipationRequests(t.db, t.app.config.locationEncKey)).toEqual([]);
    expect(JSON.stringify(await t.db.select().from(schema.requesterCredentials))).not.toContain(
      r.api_key.slice(-20),
    );
  });

  it("emails a copy when a mailer is set; a failed send keeps the key", async () => {
    const mail = new FakeMailer();
    t.app.mailer = mail;
    const r = await issue();
    expect(r.emailed).toBe(true);
    expect(mail.sent[0]).toMatchObject({ to: "agent@example.com", subject: "Your ProofMarket API key" });
    expect(mail.sent[0]?.text).toContain(r.api_key);
    expect(mail.sent[0]?.text).toContain("claude mcp add --transport http proofmarket");
    expect(mail.sent[0]?.text).toContain(r.principal_ref);
    mail.fail = true;
    const r2 = await issue();
    expect(r2.emailed).toBe(false);
    await expect(authenticateApiKey(t.app, r2.api_key)).resolves.toBeTruthy();
  });

  it("writes the copy in Japanese by default", async () => {
    const mail = new FakeMailer();
    t.app.mailer = mail;
    await createParticipationRequest(t.app, { ...req, lang: undefined }, "ip");
    expect(mail.sent[0]?.subject).toBe("ProofMarket の API キー（控え）");
  });

  it("one network gets at most 3 keys a day; the next day it can again", async () => {
    for (let i = 0; i < KEYS_PER_IP_PER_DAY; i++) await issue("7.7.7.7");
    const before = await credentials();
    expect(await err(createParticipationRequest(t.app, req, "7.7.7.7"))).toBe("RATE_LIMITED");
    expect(await credentials()).toBe(before);
    expect(await err(issue("6.6.6.6"))).toBeNull();
    t.advance(86_400_000);
    expect(await err(issue("7.7.7.7"))).toBeNull();
  });

  it("workers still wait for the operator, with no key and no email", async () => {
    const mail = new FakeMailer();
    t.app.mailer = mail;
    const before = await credentials();
    expect(await createParticipationRequest(t.app, ok, "ip")).toEqual({ ok: true, delivery: "operator" });
    expect(mail.sent).toEqual([]);
    expect(await credentials()).toBe(before);
    expect(await listParticipationRequests(t.db, t.app.config.locationEncKey)).toHaveLength(1);
  });
});

describe("Resend adapter", () => {
  it("posts from/to/subject/text with the bearer key and reports refusals without the body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let status = 200;
    const m = createResendMailer({
      apiKey: "re_test",
      from: "ProofMarket <keys@proofmarket.fun>",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ name: "validation_error" }), { status });
      }) as unknown as typeof fetch,
    });
    expect(await m.send({ to: "a@example.com", subject: "s", text: "t" })).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect((calls[0]?.init.headers as Record<string, string> | undefined)?.authorization).toBe(
      "Bearer re_test",
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: "ProofMarket <keys@proofmarket.fun>",
      to: ["a@example.com"],
      subject: "s",
      text: "t",
    });
    status = 403;
    expect(await m.send({ to: "a@example.com", subject: "s", text: "t" })).toEqual({
      ok: false,
      reason: "resend 403 validation_error",
    });
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
