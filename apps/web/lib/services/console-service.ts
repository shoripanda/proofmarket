import "server-only";
// Requester console (01 §4.14). The API key is pasted once and exchanged for an httpOnly session cookie;
// the key itself never stays in the browser. Read-mostly: the only actions are stopping a schedule and logout.

import { ApiError, fromMicro, newId, toMicro } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { authenticateApiKey, credentialAuth, type RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { randomToken, sha256 } from "./crypto";
import { consumeRateLimit } from "./rate-limit";
import { startOfSpendDay } from "./requester-service";
import { listSchedules } from "./schedule-service";

export const CONSOLE_COOKIE = "pm_console";
export const CONSOLE_SESSION_HOURS = 12;

export async function createConsoleSession(app: AppContext, raw: unknown, ip: string) {
  await consumeRateLimit(app, `console-login:${sha256(ip).toString("hex").slice(0, 32)}`, 10);
  const key = (raw as { api_key?: unknown } | null)?.api_key;
  if (typeof key !== "string") throw new ApiError("VALIDATION_FAILED", { field: "api_key" });
  const auth = await authenticateApiKey(app, key.trim());
  const token = randomToken();
  const expiresAt = new Date(app.now().getTime() + CONSOLE_SESSION_HOURS * 3600_000);
  await app.db.insert(schema.consoleSessions).values({
    id: newId("consoleSession"),
    credentialId: auth.credentialId,
    tokenHash: sha256(token),
    createdAt: app.now(),
    expiresAt,
  });
  return { token, expiresAt };
}

/** Resolves the cookie to the key's auth, re-checking that the key is still active. */
export async function consoleAuth(app: AppContext, token: string | undefined): Promise<RequesterAuth | null> {
  if (!token) return null;
  const [s] = await app.db
    .select()
    .from(schema.consoleSessions)
    .where(
      and(
        eq(schema.consoleSessions.tokenHash, sha256(token)),
        gt(schema.consoleSessions.expiresAt, app.now()),
      ),
    );
  if (!s) return null;
  return credentialAuth(app, s.credentialId).catch(() => null);
}

export async function endConsoleSession(app: AppContext, token: string | undefined) {
  if (token)
    await app.db.delete(schema.consoleSessions).where(eq(schema.consoleSessions.tokenHash, sha256(token)));
}

/** CSRF guard for cookie-authenticated POSTs: the Origin must be this site. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const self = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const ok = origin && (origin === self || (host && new URL(origin).host === host));
  if (!ok) throw new ApiError("FORBIDDEN", { reason: "cross_origin" });
}

export function sessionCookie(token: string, expiresAt: Date, req: Request): string {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.get("host") ?? "");
  return [
    `${CONSOLE_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${expiresAt.toUTCString()}`,
    ...(local ? [] : ["Secure"]),
  ].join("; ");
}

export function clearedCookie(): string {
  return `${CONSOLE_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function dashboard(app: AppContext, auth: RequesterAuth) {
  const now = app.now();
  const [cred] = await app.db
    .select()
    .from(schema.requesterCredentials)
    .where(eq(schema.requesterCredentials.id, auth.credentialId));
  const [bal] = await app.db
    .select({ s: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.requesterLedger)
    .where(eq(schema.requesterLedger.credentialId, auth.credentialId));
  const [today] = await app.db
    .select({ s: sql<string>`coalesce(sum(-amount), 0)` })
    .from(schema.requesterLedger)
    .where(
      and(
        eq(schema.requesterLedger.credentialId, auth.credentialId),
        eq(schema.requesterLedger.entryType, "RESERVE"),
        gte(schema.requesterLedger.createdAt, startOfSpendDay(now)),
      ),
    );
  const tasks = await app.db
    .select({ t: schema.verificationRequests, answer: schema.verificationResults.finalAnswer })
    .from(schema.verificationRequests)
    .leftJoin(
      schema.verificationResults,
      eq(schema.verificationResults.verificationId, schema.verificationRequests.id),
    )
    .where(eq(schema.verificationRequests.credentialId, auth.credentialId))
    .orderBy(desc(schema.verificationRequests.createdAt))
    .limit(30);
  const endpoints = await app.db
    .select({
      id: schema.webhookEndpoints.id,
      url: schema.webhookEndpoints.url,
      status: schema.webhookEndpoints.status,
    })
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.credentialId, auth.credentialId));
  const deliveries = endpoints.length
    ? await app.db
        .select()
        .from(schema.webhookDeliveries)
        .where(
          inArray(
            schema.webhookDeliveries.endpointId,
            endpoints.map((e) => e.id),
          ),
        )
        .orderBy(desc(schema.webhookDeliveries.id))
        .limit(20)
    : [];
  const money = (s: string | undefined) => fromMicro(toMicro(String(s ?? "0")));
  return {
    key: {
      prefix: cred?.keyPrefix ?? "",
      status: cred?.status ?? "",
      allowed_task_types: cred?.allowedTaskTypes ?? [],
      max_task_amount: money(cred?.maxTaskAmount),
      daily_spend_limit: money(cred?.dailySpendLimit),
      rate_limit_per_min: cred?.rateLimitPerMin ?? 0,
    },
    balance: money(bal?.s),
    spent_today: money(today?.s),
    tasks: tasks.map(({ t, answer }) => ({
      verification_id: t.id,
      type: t.type,
      status: t.status,
      answer,
      created_at: t.createdAt.toISOString(),
      recheck_of: t.recheckOf,
    })),
    webhooks: {
      endpoints: endpoints.map((e) => ({ url: e.url, status: e.status })),
      deliveries: deliveries.map((d) => ({
        verification_id: d.verificationId,
        event: d.eventType,
        attempts: d.attempts,
        last_status: d.lastStatus,
        delivered_at: d.deliveredAt?.toISOString() ?? null,
      })),
    },
    schedules: (await listSchedules(app, auth)).schedules,
  };
}
