import "server-only";

// Operator-side provisioning used by scripts/ and tests (04 §5): principals, API keys, places, top-ups.

import { randomBytes } from "node:crypto";
import { newId } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { appendAudit } from "./audit";
import { randomToken, sha256 } from "./crypto";

export async function createPrincipal(
  db: Db,
  p: { displayName: string; type: "person" | "organization" },
): Promise<string> {
  const id = newId("principal");
  await db.insert(schema.principals).values({ id, type: p.type, displayName: p.displayName });
  return id;
}

/** Returns the plaintext key ONCE; only SHA-256(secret) is stored. */
export async function issueApiKey(
  db: Db,
  o: {
    principalId: string;
    requesterName: string;
    maxTaskAmount: string;
    dailySpendLimit: string;
    rateLimitPerMin?: number;
    operator: string;
  },
): Promise<{ credentialId: string; apiKey: string }> {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomToken();
  const credentialId = newId("credential");
  await db.insert(schema.requesterCredentials).values({
    id: credentialId,
    principalId: o.principalId,
    requesterName: o.requesterName,
    keyPrefix: prefix,
    secretHash: sha256(secret),
    maxTaskAmount: o.maxTaskAmount,
    dailySpendLimit: o.dailySpendLimit,
    rateLimitPerMin: o.rateLimitPerMin ?? 30,
  });
  await appendAudit(db, {
    verificationId: null,
    actorType: "operator",
    actorRef: o.operator,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: credentialId,
    metadata: { action: "issue_api_key", key_prefix: prefix },
  });
  return { credentialId, apiKey: `pm_test_${prefix}_${secret}` };
}

export async function topUp(db: Db, credentialId: string, amount: string): Promise<void> {
  await db.insert(schema.requesterLedger).values({ credentialId, entryType: "TOPUP", amount });
}

export async function registerPlace(
  db: Db,
  p: {
    name: string;
    lat: number;
    lng: number;
    category: "retail" | "restaurant" | "service" | "public_facility";
    by: string;
  },
): Promise<string> {
  const id = newId("place");
  await db
    .insert(schema.places)
    .values({ id, name: p.name, lat: p.lat, lng: p.lng, category: p.category, approvedBy: p.by });
  await appendAudit(db, {
    verificationId: null,
    actorType: "operator",
    actorRef: p.by,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: id,
    metadata: { action: "register_place", place_id: id },
  });
  return id;
}
