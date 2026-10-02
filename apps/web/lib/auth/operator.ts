import "server-only";
import { ApiError } from "@proofmarket/core";
import { safeEqual } from "../services/crypto";

/** `Authorization: Bearer <ADMIN_TOKEN>`, constant-time compare. Returns an operator label for the audit log. */
export function authenticateOperator(req: Request, adminToken: string): string {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !adminToken || !safeEqual(token, adminToken)) throw new ApiError("UNAUTHENTICATED");
  return req.headers.get("x-operator") ?? "operator";
}

/** `X-Internal-Secret: <INTERNAL_CRON_SECRET>`, constant-time compare. */
export function authenticateCron(req: Request, secret: string): void {
  const got = req.headers.get("x-internal-secret") ?? "";
  if (!got || !secret || !safeEqual(got, secret)) throw new ApiError("UNAUTHENTICATED");
}
