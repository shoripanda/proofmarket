// Decimal strings <-> integer base units (USDC: 6 decimals). Never use floats for money.
import { mustAsset } from "./assets.ts";
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

/**
 * Off-chain micro units (10^-6) -> the asset's base units on chain (16 §4). SOL: x 1000 (lamports);
 * BONK (5 decimals): / 10, and an amount finer than the asset allows is a bug the API should have refused.
 */
export function toBaseUnits(micro: bigint, asset: string): bigint {
  const d = mustAsset(asset).decimals - LIMITS.bountyDecimals;
  if (d >= 0) return micro * 10n ** BigInt(d);
  const f = 10n ** BigInt(-d);
  if (micro % f !== 0n) throw new Error(`amount ${micro} micro is finer than ${asset} allows`);
  return micro / f;
}

/** On-chain base units -> off-chain micro units, rounding down (SOL: lamports / 1000; dust is dropped). */
export function fromBaseUnits(base: bigint, asset: string): bigint {
  const d = mustAsset(asset).decimals - LIMITS.bountyDecimals;
  return d >= 0 ? base / 10n ** BigInt(d) : base * 10n ** BigInt(-d);
}

/** Fraction digits of a decimal string ("0.50" -> 2). */
export function fractionDigits(amount: string): number {
  return amount.split(".")[1]?.length ?? 0;
}

/** 500000n -> "0.5" (trailing zeros trimmed, at least one integer digit). */
export function fromMicro(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(LIMITS.bountyDecimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}
