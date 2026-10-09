import "server-only";
import { ApiError, RATE_LIMIT_WINDOW_S } from "@proofmarket/core";
import { sql } from "drizzle-orm";
import type { AppContext } from "../context";

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetS: number;
}

/** Fixed 1-minute window, single upsert (04 §3.19). Throws RATE_LIMITED when exceeded. */
export async function consumeRateLimit(
  app: AppContext,
  scope: string,
  limitPerMin: number,
): Promise<RateLimitState> {
  const now = app.now();
  const windowStart = new Date(
    Math.floor(now.getTime() / (RATE_LIMIT_WINDOW_S * 1000)) * RATE_LIMIT_WINDOW_S * 1000,
  );
  const res = await app.db.execute<{ count: number }>(sql`
    insert into rate_limit_counters (scope, window_start, count) values (${scope}, ${windowStart.toISOString()}, 1)
    on conflict (scope, window_start) do update set count = rate_limit_counters.count + 1
    returning count`);
  const rows =
    (res as unknown as { rows?: { count: number }[] }).rows ?? (res as unknown as { count: number }[]);
  const used = Number(rows[0]?.count ?? 1);
  const state = {
    limit: limitPerMin,
    remaining: Math.max(0, limitPerMin - used),
    resetS: Math.ceil((windowStart.getTime() + RATE_LIMIT_WINDOW_S * 1000 - now.getTime()) / 1000),
  };
  if (used > limitPerMin) throw new ApiError("RATE_LIMITED", { retry_after_s: state.resetS });
  return state;
}

export function rateLimitHeaders(s: RateLimitState): Record<string, string> {
  return {
    "RateLimit-Limit": String(s.limit),
    "RateLimit-Remaining": String(s.remaining),
    "RateLimit-Reset": String(s.resetS),
  };
}

/** Fixed UTC-day window in the same table (01 §4.28). Throws RATE_LIMITED when exceeded. */
export async function consumeDailyLimit(app: AppContext, scope: string, limitPerDay: number): Promise<void> {
  const now = app.now();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const res = await app.db.execute<{ count: number }>(sql`
    insert into rate_limit_counters (scope, window_start, count) values (${scope}, ${dayStart.toISOString()}, 1)
    on conflict (scope, window_start) do update set count = rate_limit_counters.count + 1
    returning count`);
  const rows =
    (res as unknown as { rows?: { count: number }[] }).rows ?? (res as unknown as { count: number }[]);
  if (Number(rows[0]?.count ?? 1) > limitPerDay) {
    const retry = Math.ceil((dayStart.getTime() + 86_400_000 - now.getTime()) / 1000);
    throw new ApiError("RATE_LIMITED", { retry_after_s: retry, limit: "per_day" });
  }
}
