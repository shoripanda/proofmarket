// POST /v1/worker/tasks/{id}/evidence — 05 §3.6 (P0). Auth: worker. Implementation: PR-06.
// Pre-checks -> HTTP errors; checks (07 §3) -> 200 body. Idempotency-Key required.
import { notImplemented } from "@/lib/http";

export const POST = notImplemented("PR-06");
