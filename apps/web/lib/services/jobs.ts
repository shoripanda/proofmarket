import "server-only";
import type { OutboxJobKind } from "@proofmarket/core";

/** Lease one runnable job (PENDING due, or RUNNING with expired lease) with SKIP LOCKED; commit; return it (02 §4.1). */
export async function leaseNextJob(
  _runnerId: string,
): Promise<{ id: number; kind: OutboxJobKind; payload: unknown } | null> {
  throw new Error("NOT_IMPLEMENTED: leaseNextJob (PR-07)");
}

/** Dispatch to FUND_TASK / FINALIZE_AND_SETTLE / REFUND_TASK / DELIVER_WEBHOOK / PURGE_EVIDENCE handlers. PR-07/11. */
export async function runJob(_jobId: number, _runnerId: string): Promise<void> {
  throw new Error("NOT_IMPLEMENTED: runJob (PR-07)");
}

/** Called from route handlers via next/server after(): try the job just enqueued, outside response time. */
export function kickAfterResponse(_dedupeKey: string): void {
  throw new Error("NOT_IMPLEMENTED: kickAfterResponse (PR-07)");
}

/** /api/internal/tick body: expire deadlines/claims/nonces, run up to N leased jobs, hourly reconciliation, daily purge. */
export async function tick(): Promise<{ expired: number; jobsRun: number }> {
  throw new Error("NOT_IMPLEMENTED: tick (PR-07)");
}
