import "server-only";
// Sign-ups from /join (04 §3.20, 05 §1). Email is stored encrypted and the row is deleted after 90 days.

import { ApiError, newId, PARTICIPATION_AREAS, PARTICIPATION_ROLES } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context";
import { decryptBytes, encryptBytes, sha256 } from "./crypto";
import { consumeRateLimit } from "./rate-limit";

/** Bump when the notice shown next to the form changes. */
export const PARTICIPATION_CONSENT_VERSION = "2026-10-04";
export const PARTICIPATION_RETENTION_DAYS = 90;

const BodySchema = z
  .object({
    role: z.enum(PARTICIPATION_ROLES),
    email: z.email().max(254),
    area: z.enum(PARTICIPATION_AREAS).optional(),
    note: z.string().trim().max(500).optional(),
    consent: z.literal(true),
    /** Honeypot: hidden from people, filled by naive bots. */
    website: z.string().max(0).optional(),
  })
  .strict();

export async function createParticipationRequest(app: AppContext, raw: unknown, ip: string) {
  // The IP is only hashed for the rate-limit scope, never stored with the request.
  await consumeRateLimit(app, `participation:${sha256(ip).toString("hex").slice(0, 32)}`, 5);
  const r = BodySchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const b = r.data;
  const now = app.now();
  const id = newId("participation");
  await app.db.insert(schema.participationRequests).values({
    id,
    role: b.role,
    contactEnc: encryptBytes(app.config.locationEncKey, Buffer.from(b.email.toLowerCase(), "utf8")),
    area: b.role === "worker" ? (b.area ?? "other") : null,
    note: b.note || null,
    consentVersion: PARTICIPATION_CONSENT_VERSION,
    createdAt: now,
    deleteAfter: new Date(now.getTime() + PARTICIPATION_RETENTION_DAYS * 86_400_000),
  });
  return { ok: true as const };
}

/** Operator view for scripts/list-participation.ts. Decrypts contact addresses. */
export async function listParticipationRequests(db: Db, encKey: Buffer, status = "new") {
  const rows = await db
    .select()
    .from(schema.participationRequests)
    .where(eq(schema.participationRequests.status, status));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    email: decryptBytes(encKey, r.contactEnc).toString("utf8"),
    area: r.area,
    note: r.note,
    created_at: r.createdAt.toISOString(),
  }));
}

export async function setParticipationStatus(db: Db, id: string, status: "contacted" | "closed") {
  const r = await db
    .update(schema.participationRequests)
    .set({ status })
    .where(eq(schema.participationRequests.id, id))
    .returning({ id: schema.participationRequests.id });
  if (!r.length) throw new ApiError("VALIDATION_FAILED", { participation: id, reason: "not found" });
}

export async function purgeExpiredParticipation(app: AppContext): Promise<number> {
  const r = await app.db
    .delete(schema.participationRequests)
    .where(lte(schema.participationRequests.deleteAfter, app.now()))
    .returning({ id: schema.participationRequests.id });
  return r.length;
}
