// Rising bounty (13 §1): the reward climbs in a straight line from `amount` at creation to `maxAmount`
// after `rampMinutes`, and is fixed for everyone at the first claim. Integer base units, never floats.
import { fromMicro, toMicro } from "./money.ts";

export interface RisingBounty {
  amount: string;
  maxAmount: string | null;
  rampMinutes: number | null;
  finalAmount: string | null;
  createdAt: Date;
}

/** Base units per witness at `now`: the fixed amount once settled, else amount + (max − amount) × min(1, elapsed / ramp). */
export function currentBountyMicro(b: RisingBounty, now: Date): bigint {
  if (b.finalAmount !== null) return toMicro(b.finalAmount);
  const start = toMicro(b.amount);
  if (b.maxAmount === null || !b.rampMinutes) return start;
  const max = toMicro(b.maxAmount);
  const rampMs = BigInt(b.rampMinutes * 60_000);
  const elapsed = BigInt(Math.max(0, now.getTime() - b.createdAt.getTime()));
  if (elapsed >= rampMs) return max;
  return start + ((max - start) * elapsed) / rampMs; // floored to 6 decimals
}

/** Decimal string of {@link currentBountyMicro}. */
export function currentBounty(b: RisingBounty, now: Date): string {
  return fromMicro(currentBountyMicro(b, now));
}

/** When the reward stops rising, or null when it is fixed (or already fixed by a claim). */
export function bountyRisesUntil(b: RisingBounty): Date | null {
  if (b.finalAmount !== null || b.maxAmount === null || !b.rampMinutes) return null;
  return new Date(b.createdAt.getTime() + b.rampMinutes * 60_000);
}

/** What the escrow holds per witness: the ceiling for a rising bounty. */
export function fundedPerWitnessMicro(b: Pick<RisingBounty, "amount" | "maxAmount">): bigint {
  return toMicro(b.maxAmount ?? b.amount);
}

/** What will be paid per witness: the fixed amount once claimed, else the funded amount. */
export function settledPerWitnessMicro(
  b: Pick<RisingBounty, "amount" | "maxAmount" | "finalAmount">,
): bigint {
  return toMicro(b.finalAmount ?? b.maxAmount ?? b.amount);
}
