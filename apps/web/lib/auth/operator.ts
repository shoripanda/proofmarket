import "server-only";

/** `Authorization: Bearer <ADMIN_TOKEN>`, constant-time compare. PR-07. */
export function authenticateOperator(_req: Request): void {
  throw new Error("NOT_IMPLEMENTED: authenticateOperator (PR-07)");
}

/** `X-Internal-Secret: <INTERNAL_CRON_SECRET>`, constant-time compare. PR-07. */
export function authenticateCron(_req: Request): void {
  throw new Error("NOT_IMPLEMENTED: authenticateCron (PR-07)");
}
