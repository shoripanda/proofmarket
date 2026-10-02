import "server-only";
import type { TaskEvent } from "@proofmarket/core";
import type { CreateVerificationRequest, GetVerificationResponse } from "@proofmarket/core/schemas/api";
import type { RequesterAuth } from "../auth/requester";

/**
 * 05 §2.1 checks 2-17 in order; lock credential row before 15-17; insert CREATED + RESERVE + audit + FUND_TASK
 * outbox in one transaction. Matches an active place within 30 m (REQ-X-T-104). PR-04.
 */
export async function createVerification(
  _auth: RequesterAuth,
  _body: CreateVerificationRequest,
): Promise<{ verificationId: string; createdAt: Date }> {
  throw new Error("NOT_IMPLEMENTED: createVerification (PR-04)");
}

export async function getVerification(_auth: RequesterAuth, _id: string): Promise<GetVerificationResponse> {
  throw new Error("NOT_IMPLEMENTED: getVerification (PR-04)");
}

export async function cancelVerification(
  _auth: RequesterAuth,
  _id: string,
): Promise<GetVerificationResponse> {
  throw new Error("NOT_IMPLEMENTED: cancelVerification (PR-04)");
}

/**
 * The only way task status changes: SELECT ... FOR UPDATE, core.transition(), then apply effects
 * (status, audit, outbox, webhook, ledger) in the same transaction (03 §5). PR-03/04.
 */
export async function applyTaskEvent(
  _tx: unknown,
  _verificationId: string,
  _event: TaskEvent,
): Promise<void> {
  throw new Error("NOT_IMPLEMENTED: applyTaskEvent (PR-03)");
}

export async function listWorkerTasks(_workerId: string, _q: { lat: number; lng: number; radiusKm: number }) {
  throw new Error("NOT_IMPLEMENTED: listWorkerTasks (PR-05)");
}

export async function claimTask(_workerId: string, _verificationId: string) {
  throw new Error("NOT_IMPLEMENTED: claimTask (PR-05)");
}

export async function issueChallenge(_workerId: string, _claimId: string) {
  throw new Error("NOT_IMPLEMENTED: issueChallenge (PR-05)");
}

export async function abandonClaim(_workerId: string, _claimId: string) {
  throw new Error("NOT_IMPLEMENTED: abandonClaim (PR-05)");
}
