import "server-only";
import type { ActorType, AuditEventType } from "@proofmarket/core";

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

/** Append within the caller's transaction. PR-02/07. */
export async function appendAudit(_tx: unknown, _e: AuditInput): Promise<void> {
  throw new Error("NOT_IMPLEMENTED: appendAudit (PR-02)");
}
