import "server-only";
// Signed, retry-safe webhooks (05 §5). Deliveries never touch settlement; the body carries no result.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  newId,
  WEBHOOK_EVENTS,
  WEBHOOK_RETRY_DELAYS_S,
  WEBHOOK_TIMEOUT_MS,
  type WebhookEvent,
} from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { decryptBytes, encryptBytes, sha256 } from "./crypto";
import type { JobOutcome } from "./settlement-jobs";

/** `t=<unix>,v1=<hex(HMAC-SHA256(secret, t + "." + body))>` */
export function signWebhook(secret: string, timestampS: number, body: string): string {
  return `t=${timestampS},v1=${createHmac("sha256", secret).update(`${timestampS}.${body}`).digest("hex")}`;
}

/** Receiver-side helper (also used in tests): constant-time compare within tolerance. */
export function verifyWebhook(
  secret: string,
  header: string,
  body: string,
  nowS: number,
  toleranceS = 300,
): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!m?.[1] || !m[2]) return false;
  const t = Number(m[1]);
  if (Math.abs(nowS - t) > toleranceS) return false;
  const expected = signWebhook(secret, t, body).split("v1=")[1] ?? "";
  return expected.length === m[2].length && timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]));
}

const keyFor = (pepper: string) => sha256(`webhook-secret-key:${pepper}`);

/** IPv4/IPv6 ranges a callback must never reach (SSRF, 08 §1.4). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  return (
    v === "::1" ||
    v === "::" ||
    v.startsWith("fc") ||
    v.startsWith("fd") ||
    v.startsWith("fe80") ||
    v.startsWith("::ffff:127.") ||
    v.startsWith("::ffff:10.") ||
    v.startsWith("::ffff:192.168.")
  );
}

export type Resolver = (host: string) => Promise<string[]>;
const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/** https only, no IP literals, every resolved address public. Throws with a reason. */
export async function assertSafeCallbackUrl(raw: string, resolve: Resolver = dnsResolver): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("callback must be https");
  if (u.username || u.password) throw new Error("credentials in URL are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) throw new Error("IP literals are not allowed");
  const addrs = await resolve(host);
  if (addrs.length === 0 || addrs.some(isPrivateAddress))
    throw new Error("callback resolves to a non-public address");
  return u;
}

/** Operator-side registration (scripts/register-webhook.ts). Returns the signing secret once. */
export async function registerWebhook(
  app: AppContext,
  o: { credentialId: string; url: string; events: WebhookEvent[]; by: string; resolve?: Resolver },
): Promise<{ endpointId: string; secret: string }> {
  await assertSafeCallbackUrl(o.url, o.resolve);
  for (const e of o.events) if (!WEBHOOK_EVENTS.includes(e)) throw new Error(`unknown event ${e}`);
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const endpointId = newId("webhookEndpoint");
  await app.db.insert(schema.webhookEndpoints).values({
    id: endpointId,
    credentialId: o.credentialId,
    url: o.url,
    secretEnc: encryptBytes(keyFor(app.config.webhookPepper), Buffer.from(secret)),
    events: o.events,
  });
  await appendAudit(app.db, {
    verificationId: null,
    actorType: "operator",
    actorRef: o.by,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: endpointId,
    metadata: { action: "register_webhook", credential_id: o.credentialId, host: new URL(o.url).host },
  });
  return { endpointId, secret };
}

/** The active endpoint used for new tasks of a credential (first registered). */
export async function activeEndpoint(db: Db, credentialId: string): Promise<string | null> {
  const [e] = await db
    .select()
    .from(schema.webhookEndpoints)
    .where(
      and(
        eq(schema.webhookEndpoints.credentialId, credentialId),
        eq(schema.webhookEndpoints.status, "active"),
      ),
    )
    .limit(1);
  return e?.id ?? null;
}

export interface DeliverDeps {
  fetch?: typeof fetch;
  resolve?: Resolver;
}

/** DELIVER_WEBHOOK job. Same evt_ id across retries so receivers can de-duplicate. */
export async function deliverWebhook(
  app: AppContext,
  p: { verification_id: string; endpoint_id: string; event: WebhookEvent },
  deps: DeliverDeps = {},
): Promise<JobOutcome> {
  const [ep] = await app.db
    .select()
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.id, p.endpoint_id));
  if (ep?.status !== "active" || !ep.events.includes(p.event)) return { kind: "done" };
  const [task] = await app.db
    .select({ status: schema.verificationRequests.status })
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.id, p.verification_id));
  if (!task) return { kind: "done" };

  let [d] = await app.db
    .select()
    .from(schema.webhookDeliveries)
    .where(
      and(
        eq(schema.webhookDeliveries.endpointId, ep.id),
        eq(schema.webhookDeliveries.verificationId, p.verification_id),
        eq(schema.webhookDeliveries.eventType, p.event),
      ),
    );
  if (!d) {
    const payload = {
      id: newId("webhookEvent"),
      type: p.event,
      created_at: app.now().toISOString(),
      data: { verification_id: p.verification_id, status: task.status },
    };
    [d] = await app.db
      .insert(schema.webhookDeliveries)
      .values({
        id: payload.id,
        endpointId: ep.id,
        verificationId: p.verification_id,
        eventType: p.event,
        payload,
      })
      .onConflictDoNothing()
      .returning();
    if (!d) return { kind: "done" };
  }
  if (d.deliveredAt) return { kind: "done" };

  const attempt = d.attempts + 1;
  const body = JSON.stringify(d.payload);
  const secret = decryptBytes(keyFor(app.config.webhookPepper), ep.secretEnc).toString("utf8");
  let status = 0;
  try {
    const url = await assertSafeCallbackUrl(ep.url, deps.resolve);
    const res = await (deps.fetch ?? fetch)(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "proofmarket-signature": signWebhook(secret, Math.floor(app.now().getTime() / 1000), body),
        "proofmarket-event-id": d.id,
      },
      body,
    });
    status = res.status;
  } catch {
    status = 0;
  }
  const ok = status >= 200 && status < 300;
  await app.db
    .update(schema.webhookDeliveries)
    .set({ attempts: attempt, lastStatus: status, ...(ok ? { deliveredAt: app.now() } : {}) })
    .where(eq(schema.webhookDeliveries.id, d.id));
  if (ok) return { kind: "done" };
  const delay = WEBHOOK_RETRY_DELAYS_S[attempt - 1];
  return delay === undefined
    ? { kind: "dead", error: `webhook gave up after ${attempt} attempts (last ${status})` }
    : { kind: "retry", error: `HTTP ${status}`, delayS: delay };
}
