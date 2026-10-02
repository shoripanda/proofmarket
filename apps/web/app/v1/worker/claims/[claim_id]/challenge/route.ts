// POST /v1/worker/claims/{claim_id}/challenge — 05 §3.4 (P0). Auth: worker. Implementation: PR-05.
// Supersede ISSUED challenge; TTL = min(freshness, claim left, deadline left).
import { notImplemented } from "@/lib/http";

export const POST = notImplemented("PR-05");
