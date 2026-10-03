// Webhooks (05 §5, 09 I-WH-01): signature, SSRF guard, retries, and no effect on settlement.
import { schema } from "@proofmarket/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate } from "../lib/handlers/requester";
import { tick } from "../lib/services/jobs";
import {
  assertSafeCallbackUrl,
  isPrivateAddress,
  registerWebhook,
  signWebhook,
  verifyWebhook,
} from "../lib/services/webhook-service";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});
const publicDns = async () => ["93.184.216.34"];

describe("webhooks", () => {
  it("signature round-trips and rejects tampering or stale timestamps", () => {
    const h = signWebhook("whsec_x", 1_700_000_000, '{"a":1}');
    expect(verifyWebhook("whsec_x", h, '{"a":1}', 1_700_000_100)).toBe(true);
    expect(verifyWebhook("whsec_x", h, '{"a":2}', 1_700_000_100)).toBe(false);
    expect(verifyWebhook("whsec_y", h, '{"a":1}', 1_700_000_100)).toBe(false);
    expect(verifyWebhook("whsec_x", h, '{"a":1}', 1_700_000_400)).toBe(false);
  });

  it("SSRF guard: https only, no IP literals, no private resolution", async () => {
    await expect(assertSafeCallbackUrl("http://hooks.example.com/x", publicDns)).rejects.toThrow(/https/);
    await expect(assertSafeCallbackUrl("https://10.0.0.5/x", publicDns)).rejects.toThrow(/IP literals/);
    await expect(
      assertSafeCallbackUrl("https://evil.example.com/x", async () => ["127.0.0.1"]),
    ).rejects.toThrow(/non-public/);
    await expect(
      assertSafeCallbackUrl("https://evil.example.com/x", async () => ["93.184.216.34", "169.254.169.254"]),
    ).rejects.toThrow();
    expect((await assertSafeCallbackUrl("https://hooks.example.com/x", publicDns)).host).toBe(
      "hooks.example.com",
    );
    for (const ip of [
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "127.0.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fd00::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("I-WH-01: signed events delivered once; receiver outage retries without touching settlement", async () => {
    const { secret } = await registerWebhook(t.app, {
      credentialId: t.credentialId,
      url: "https://hooks.example.com/pm",
      events: ["verification.open", "verification.verified", "verification.settled"],
      by: "test",
      resolve: publicDns,
    });
    const received: { headers: Headers; body: string }[] = [];
    let down = true;
    const fakeFetch = (async (_u: URL, init: RequestInit) => {
      received.push({ headers: new Headers(init.headers), body: String(init.body) });
      return new Response(null, { status: down ? 503 : 200 });
    }) as unknown as typeof fetch;
    // Route the job's network I/O through the fakes.
    const jobs = await import("../lib/services/jobs");
    jobs.__setWebhookDeps({ fetch: fakeFetch, resolve: publicDns });

    const res = await call(
      (r) => handleCreate(t.app, r),
      jsonReq("POST", "/v1/verifications", { key: t.apiKey, body: createBody(t.principalId), idem: "wh-1" }),
    );
    const { verification_id: id } = (await res.json()) as { verification_id: string };
    await tick(t.app); // real FUND_TASK on the fake chain -> OPEN
    const alice = (await onboardWorker(t, "alice")).token;
    await witness(t, alice, id);
    await tick(t.app); // settle + webhook attempts while receiver is down
    const [task] = await t.db.select().from(schema.verificationRequests);
    expect(task?.status).toBe("SETTLED"); // webhook failure never blocks settlement

    down = false;
    t.advance(3 * 3600_000);
    await tick(t.app);
    await tick(t.app);
    const deliveries = await t.db.select().from(schema.webhookDeliveries);
    expect(deliveries.map((d) => d.eventType).sort()).toEqual([
      "verification.open",
      "verification.settled",
      "verification.verified",
    ]);
    expect(deliveries.every((d) => d.deliveredAt)).toBe(true);
    const last = received.at(-1);
    const sig = last?.headers.get("proofmarket-signature") ?? "";
    expect(verifyWebhook(secret, sig, last?.body ?? "", Math.floor(t.app.now().getTime() / 1000))).toBe(true);
    expect(JSON.parse(last?.body ?? "{}")).not.toHaveProperty("data.result");
    // retries reuse the same event id
    const ids = new Set(received.map((r) => r.headers.get("proofmarket-event-id")));
    expect(ids.size).toBe(3);
    jobs.__setWebhookDeps({});
  });
});
