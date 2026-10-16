// Platform fee (docs/architecture 13 §6.1, owner decision D3 of 2026-10-16): 15% on top of the bounty. The
// requester pays bounty + fee; the worker receives the whole bounty. Integer base units, rounded up.

/** 15% in basis points. A code constant, not an env var: changing the rate goes through review. */
export const PLATFORM_FEE_BPS = 1500;

/** The fee on `baseMicro` at `bps`, rounded up to the asset's smallest unit. 0 for a non-positive base or rate. */
export function platformFeeMicro(baseMicro: bigint, bps: number): bigint {
  if (bps <= 0 || baseMicro <= 0n) return 0n;
  return (baseMicro * BigInt(bps) + 9_999n) / 10_000n;
}
