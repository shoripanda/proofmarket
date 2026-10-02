// POST /v1/verifications — 05 §2.1 (P0). Auth: requester. Implementation: PR-04.
// Create verification. Idempotency-Key required. Lock requester_credentials row before limit checks (02 §4.2).
import { notImplemented } from "@/lib/http";

export const POST = notImplemented("PR-04");
