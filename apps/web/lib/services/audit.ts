import "server-only";
import type { ActorType, AuditEventType } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";

export interface AuditInput {
  verificationId: string | null;
  actorType: ActorType;
  actorRef: string | null;
  eventType: AuditEventType;
  beforeState: string | null;
  afterState: string | null;
  correlationId: string;
  /** Never coordinates, photos, tokens, nonces or secrets (04 §3.15). */
  metadata?: Record<string, unknown>;
}

/** Append within the caller's transaction. The table rejects UPDATE/DELETE (0001_custom.sql). */
export async function appendAudit(tx: Db, e: AuditInput): Promise<void> {
  await tx.insert(schema.auditEvents).values({
    verificationId: e.verificationId,
    actorType: e.actorType,
    actorRef: e.actorRef,
    eventType: e.eventType,
    beforeState: e.beforeState,
    afterState: e.afterState,
    correlationId: e.correlationId,
    metadata: e.metadata ?? {},
  });
}
