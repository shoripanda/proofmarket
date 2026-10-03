import "server-only";
// Reports from shops (01 §4.13). A secret per-place link lets a shop say "closed today" / "open as usual".
// Context for requesters only: never used to decide a result and never shown to workers.

import { ApiError, newId, STORE_REPORT_STATUSES } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { consumeRateLimit } from "./rate-limit";

/** Returns the token ONCE; only its hash is stored. */
export async function issuePlaceToken(
  db: Db,
  placeId: string,
  by: string,
): Promise<{ tokenId: string; token: string }> {
  const [place] = await db.select().from(schema.places).where(eq(schema.places.id, placeId));
  if (!place) throw new ApiError("VALIDATION_FAILED", { place: placeId, reason: "not found" });
  const token = randomToken();
  const tokenId = newId("placeOwnerToken");
  await db.insert(schema.placeOwnerTokens).values({ id: tokenId, placeId, tokenHash: sha256(token) });
  await appendAudit(db, {
    verificationId: null,
    actorType: "operator",
    actorRef: by,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: tokenId,
    metadata: { action: "issue_place_token", place_id: placeId },
  });
  return { tokenId, token };
}

export async function revokePlaceToken(db: Db, tokenId: string, now: Date) {
  const r = await db
    .update(schema.placeOwnerTokens)
    .set({ revokedAt: now })
    .where(eq(schema.placeOwnerTokens.id, tokenId))
    .returning({ id: schema.placeOwnerTokens.id });
  if (!r.length) throw new ApiError("VALIDATION_FAILED", { token: tokenId, reason: "not found" });
}

async function tokenRow(app: AppContext, token: string) {
  const [row] = await app.db
    .select({ t: schema.placeOwnerTokens, place: schema.places })
    .from(schema.placeOwnerTokens)
    .innerJoin(schema.places, eq(schema.places.id, schema.placeOwnerTokens.placeId))
    .where(
      and(eq(schema.placeOwnerTokens.tokenHash, sha256(token)), isNull(schema.placeOwnerTokens.revokedAt)),
    );
  if (!row) throw new ApiError("UNAUTHENTICATED");
  return row;
}

/** The report in force at `at`: the newest one filed before `at` that has not expired. */
export async function activeReport(db: Db, placeId: string, at: Date) {
  const [r] = await db
    .select()
    .from(schema.placeStatusReports)
    .where(
      and(
        eq(schema.placeStatusReports.placeId, placeId),
        lte(schema.placeStatusReports.createdAt, at),
        gt(schema.placeStatusReports.validUntil, at),
      ),
    )
    .orderBy(desc(schema.placeStatusReports.createdAt))
    .limit(1);
  return r
    ? {
        status: r.status as (typeof STORE_REPORT_STATUSES)[number],
        reported_at: r.createdAt.toISOString(),
        valid_until: r.validUntil.toISOString(),
      }
    : null;
}

export async function storeInfo(app: AppContext, token: string) {
  const { place } = await tokenRow(app, token);
  return { place_name: place.name, current: await activeReport(app.db, place.id, app.now()) };
}

/** End of today in Japan time, as a UTC instant. */
function endOfJstDay(now: Date): Date {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 1) - 9 * 3600_000);
}

const ReportSchema = z
  .object({
    status: z.enum(STORE_REPORT_STATUSES),
    valid_until: z.iso.datetime({ offset: true }).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export async function fileReport(app: AppContext, token: string, raw: unknown) {
  const { t, place } = await tokenRow(app, token);
  await consumeRateLimit(app, `store:${t.id}`, 10);
  const r = ReportSchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const now = app.now();
  const until = r.data.valid_until ? new Date(r.data.valid_until) : endOfJstDay(now);
  if (until <= now || until.getTime() - now.getTime() > 7 * 86_400_000) {
    throw new ApiError("VALIDATION_FAILED", {
      field: "valid_until",
      reason: "must be within 7 days from now",
    });
  }
  await app.db.insert(schema.placeStatusReports).values({
    id: newId("placeStatusReport"),
    placeId: place.id,
    tokenId: t.id,
    status: r.data.status,
    validUntil: until,
    note: r.data.note || null,
    createdAt: now,
  });
  return { ok: true as const, current: await activeReport(app.db, place.id, now) };
}
