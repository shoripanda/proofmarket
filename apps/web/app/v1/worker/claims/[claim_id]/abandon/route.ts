// POST /v1/worker/claims/{claim_id}/abandon — 05 §3.7 (P0). Auth: worker. Implementation: PR-05.
// ACTIVE -> ABANDONED; otherwise return current state.
import { notImplemented } from "@/lib/http";

export const POST = notImplemented("PR-05");
