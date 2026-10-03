import "server-only";
// Photo removal requests from /rules (04 §3.21, 08 §6). Email is stored encrypted; rows are kept 1 year.

import { ApiError, newId } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context";
import { decryptBytes, encryptBytes, sha256 } from "./crypto";
import { consumeRateLimit } from "./rate-limit";

export const REMOVAL_RETENTION_DAYS = 365;

const BodySchema = z
  .object({
    email: z.email().max(254),
    verification_id: z
      .string()
      .trim()
      .max(64)
      .regex(/^(ver_[0-9A-Za-z]+)?$/)
      .optional(),
    place_note: z.string().trim().max(200).optional(),
    reason: z.string().trim().min(1).max(1000),
    website: z.string().max(0).optional(),
  })
  .strict();

export async function createRemovalRequest(app: AppContext, raw: unknown, ip: string) {
  await consumeRateLimit(app, `removal:${sha256(ip).toString("hex").slice(0, 32)}`, 5);
  const r = BodySchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const b = r.data;
  const now = app.now();
  await app.db.insert(schema.removalRequests).values({
    id: newId("removal"),
    contactEnc: encryptBytes(app.config.locationEncKey, Buffer.from(b.email.toLowerCase(), "utf8")),
    verificationId: b.verification_id || null,
    placeNote: b.place_note || null,
    reason: b.reason,
    createdAt: now,
    deleteAfter: new Date(now.getTime() + REMOVAL_RETENTION_DAYS * 86_400_000),
  });
  return { ok: true as const };
}

export async function listRemovalRequests(db: Db, encKey: Buffer, status = "new") {
  const rows = await db
    .select()
    .from(schema.removalRequests)
    .where(eq(schema.removalRequests.status, status));
  return rows.map((r) => ({
    id: r.id,
    email: decryptBytes(encKey, r.contactEnc).toString("utf8"),
    verification_id: r.verificationId,
    place_note: r.placeNote,
    reason: r.reason,
    created_at: r.createdAt.toISOString(),
  }));
}

export async function setRemovalStatus(db: Db, id: string, status: "handled" | "rejected") {
  const r = await db
    .update(schema.removalRequests)
    .set({ status })
    .where(eq(schema.removalRequests.id, id))
    .returning({ id: schema.removalRequests.id });
  if (!r.length) throw new ApiError("VALIDATION_FAILED", { removal: id, reason: "not found" });
}

export async function purgeExpiredRemoval(app: AppContext): Promise<number> {
  const r = await app.db
    .delete(schema.removalRequests)
    .where(lte(schema.removalRequests.deleteAfter, app.now()))
    .returning({ id: schema.removalRequests.id });
  return r.length;
}
