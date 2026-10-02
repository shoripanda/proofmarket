import "server-only";
import { type CheckReasonCode, REASON_MESSAGES } from "@proofmarket/core";

/** Worker-facing Japanese reason text (07 §6) with {d} {r} {a} {n} placeholders filled. */
export function reasonMessage(code: string, vars: Record<string, string | number>): string | null {
  const m = REASON_MESSAGES[code as CheckReasonCode | "NONCE_EXPIRED"]?.ja;
  if (!m) return null;
  return m.replace(/\{(\w)\}/g, (_, k: string) => String(vars[k] ?? "—"));
}
