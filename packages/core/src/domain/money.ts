// Decimal strings <-> integer base units (USDC: 6 decimals). Never use floats for money.
import { LIMITS } from "./limits.ts";

const SCALE = 10n ** BigInt(LIMITS.bountyDecimals);

/** "0.5" -> 500000n. Accepts up to 6 fractional digits and an optional leading minus. */
export function toMicro(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toFixed(LIMITS.bountyDecimals) : amount.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,6})\d*)?$/.exec(s);
  if (!m?.[2]) throw new Error(`invalid amount: ${amount}`);
  const v = BigInt(m[2]) * SCALE + BigInt((m[3] ?? "").padEnd(LIMITS.bountyDecimals, "0"));
  return m[1] ? -v : v;
}

/** 500000n -> "0.5" (trailing zeros trimmed, at least one integer digit). */
export function fromMicro(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(LIMITS.bountyDecimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}
