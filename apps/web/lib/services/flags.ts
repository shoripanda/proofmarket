import "server-only";
// Platform flags (04 §3.19, 08 §6): one row per key; a missing row counts as the default given here.
import type { PlatformFlag } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";

/** Service flags are seeded true by the migrations; `external_review_enabled` is off until the operator sets it. */
const DEFAULTS: Record<PlatformFlag, boolean> = {
  tasks_create_enabled: true,
  claims_enabled: true,
  settlement_enabled: true,
  public_evidence_enabled: true,
  external_review_enabled: false,
  x402_enabled: true,
};

export async function flagEnabled(db: Db, key: PlatformFlag): Promise<boolean> {
  const [row] = await db.select().from(schema.platformFlags).where(eq(schema.platformFlags.key, key));
  return row?.value ?? DEFAULTS[key];
}
