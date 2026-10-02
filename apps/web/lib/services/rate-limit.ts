import "server-only";

/** Fixed 1-minute window, single upsert statement (04 §3.19). Returns headers for RateLimit-*. PR-04. */
export async function consumeRateLimit(
  _scope: string,
  _limitPerMin: number,
): Promise<{ allowed: boolean; remaining: number; resetS: number }> {
  throw new Error("NOT_IMPLEMENTED: consumeRateLimit (PR-04)");
}
