// Self-service webhooks (docs/architecture 12 §5.1): a key registers its own endpoints, sends a signed test,
// reads the delivery log, and deletes. Other keys see none of it.
import { WEBHOOK_EVENTS } from "@proofmarket/core";
import { beforeEach, describe, expect, it } from "vitest";
import { handleDeleteWebhook, handleListDeliveries, handleListWebhooks } from "../lib/handlers/webhooks";
import { issueApiKey } from "../lib/services/admin-service";
import {
  createOwnWebhook,
  MAX_WEBHOOK_ENDPOINTS,
  testOwnWebhook,
  verifyWebhook,
} from "../lib/services/webhook-service";
import { call, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});
const publicDns = async () => ["93.184.216.34"];
const me = () => ({ credentialId: t.credentialId, keyPrefix: "pm_test_x" });

describe("self-service webhooks", () => {
  it("registers with the secret shown once; ['*'] means every event; a private URL is refused", async () => {
    const out = await createOwnWebhook(
      t.app,
      me(),
      { url: "https://hooks.example.com/a", events: ["*"] },
      publicDns,
    );
    expect(out.secret).toMatch(/^whsec_/);
    expect(out.endpoint).toMatchObject({ url: "https://hooks.example.com/a", status: "active" });
    expect(out.endpoint.events).toEqual([...WEBHOOK_EVENTS]);

    const list = await call(
      (r) => handleListWebhooks(t.app, r),
      jsonReq("GET", "/v1/webhooks", { key: t.apiKey }),
    );
    const body = await list.json();
    expect(body.endpoints).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("whsec_");

    await expect(
      createOwnWebhook(t.app, me(), { url: "https://evil.example.com/a", events: ["*"] }, async () => [
        "127.0.0.1",
      ]),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it(`holds at most ${MAX_WEBHOOK_ENDPOINTS} active endpoints; deleting one frees a place`, async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_WEBHOOK_ENDPOINTS; i++) {
      const o = await createOwnWebhook(
        t.app,
        me(),
        { url: `https://hooks.example.com/${i}`, events: ["verification.verified"] },
        publicDns,
      );
      ids.push(o.endpoint.id);
    }
    await expect(
      createOwnWebhook(t.app, me(), { url: "https://hooks.example.com/x", events: ["*"] }, publicDns),
    ).rejects.toMatchObject({ code: "WEBHOOK_LIMIT_REACHED" });
    const del = await call(
      (r) => handleDeleteWebhook(t.app, r, ids[0] ?? ""),
      jsonReq("DELETE", `/v1/webhooks/${ids[0]}`, { key: t.apiKey }),
    );
    expect((await del.json()).endpoint.status).toBe("disabled");
    await createOwnWebhook(t.app, me(), { url: "https://hooks.example.com/y", events: ["*"] }, publicDns);
  });

  it("a test is signed like a real event, says whether the receiver took it, and is in the log", async () => {
    const { endpoint, secret } = await createOwnWebhook(
      t.app,
      me(),
      { url: "https://hooks.example.com/t", events: ["*"] },
      publicDns,
    );
    const got: { sig: string; body: string }[] = [];
    let status = 500;
    const fetch = (async (_u: URL, init: RequestInit) => {
      got.push({
        sig: new Headers(init.headers).get("proofmarket-signature") ?? "",
        body: String(init.body),
      });
      return new Response(null, { status });
    }) as unknown as typeof globalThis.fetch;

    const failed = await testOwnWebhook(t.app, t.credentialId, endpoint.id, { fetch, resolve: publicDns });
    expect(failed).toMatchObject({ ok: false, delivery: { event: "webhook.test", last_status: 500 } });
    status = 204;
    const ok = await testOwnWebhook(t.app, t.credentialId, endpoint.id, { fetch, resolve: publicDns });
    expect(ok.ok).toBe(true);
    expect(ok.delivery.verification_id).toBeNull();
    const last = got.at(-1);
    expect(
      verifyWebhook(secret, last?.sig ?? "", last?.body ?? "", Math.floor(t.app.now().getTime() / 1000)),
    ).toBe(true);

    const log = await call(
      (r) => handleListDeliveries(t.app, r),
      jsonReq("GET", `/v1/webhooks/deliveries?endpoint_id=${endpoint.id}`, { key: t.apiKey }),
    );
    const { deliveries } = await log.json();
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((d: { last_status: number }) => d.last_status).sort()).toEqual([204, 500]);
  });

  it("another key cannot see, test or delete the endpoint", async () => {
    const { endpoint } = await createOwnWebhook(
      t.app,
      me(),
      { url: "https://hooks.example.com/p", events: ["*"] },
      publicDns,
    );
    const other = await issueApiKey(t.db, {
      principalId: t.principalId,
      requesterName: "other",
      maxTaskAmount: null,
      dailySpendLimit: null,
      operator: "test",
    });
    const list = await call(
      (r) => handleListWebhooks(t.app, r),
      jsonReq("GET", "/v1/webhooks", { key: other.apiKey }),
    );
    expect((await list.json()).endpoints).toEqual([]);
    const del = await call(
      (r) => handleDeleteWebhook(t.app, r, endpoint.id),
      jsonReq("DELETE", `/v1/webhooks/${endpoint.id}`, { key: other.apiKey }),
    );
    expect(del.status).toBe(404);
    await expect(testOwnWebhook(t.app, other.credentialId, endpoint.id)).rejects.toMatchObject({
      code: "WEBHOOK_NOT_FOUND",
    });
    const log = await call(
      (r) => handleListDeliveries(t.app, r),
      jsonReq("GET", `/v1/webhooks/deliveries?endpoint_id=${endpoint.id}`, { key: other.apiKey }),
    );
    expect(log.status).toBe(404);
  });
});
