// POST /api/internal/tick — 02 §4.1 (P0). Auth: cron. Implementation: PR-07.
// X-Internal-Secret. Expire tasks/claims/nonces, run leased outbox jobs, daily purge.
import { notImplemented } from "@/lib/http";

export const POST = notImplemented("PR-07");
