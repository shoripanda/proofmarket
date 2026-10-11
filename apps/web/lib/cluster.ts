// Which Solana cluster the server talks to, and the gate in front of real money (15 §4.1, REQ-X-P-105).
// Devnet is the default. Mainnet starts only with REAL_FUNDS_ENABLED, a LEGAL_SIGNOFF reference and keys that
// were never used on Devnet; anything else throws while the context is built, so no route can serve.

export type Cluster = "devnet" | "mainnet-beta";

export const CLUSTERS = {
  devnet: {
    genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
    /** Circle's Devnet USDC. Devnet may also use an own test mint, so BOUNTY_MINT is not pinned there. */
    usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    network: "solana-devnet",
  },
  "mainnet-beta": {
    genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    network: "solana",
  },
} as const;

/** The native mint: SOL held in token accounts (15 §3.1). The same address on every cluster. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** Public keys of the Devnet admin / operator / verifier. Mainnet refuses them (08 §2). */
export const DEVNET_KEYS: readonly string[] = [
  "zWNUtDAHyhy1BQvZYNq6C9H5nLfKhWRbdDe8ZbwqcDJ",
  "5JCzti3UrorjeoabuB1QirdPtWLRwa7CK8oDSGx34kiN",
  "ETb2GXYYPpnbNjHaNfb84Ptx4UQNWdf9txnNCq2s5ycr",
];

export type GateInput = {
  cluster: Cluster;
  expectedGenesisHash: string;
  bountyMint: string;
  realFundsEnabled: boolean;
  legalSignoff: string | undefined;
  /** Base58 public keys of the operator and verifier the server signs with. */
  signerKeys: string[];
};

/** Throws with the reason when the configuration may not start. Returns the cluster's constants otherwise. */
export function checkClusterGate(i: GateInput) {
  const c = CLUSTERS[i.cluster];
  if (i.expectedGenesisHash !== c.genesisHash)
    throw new Error(`SOLANA_EXPECTED_GENESIS_HASH is not the ${i.cluster} genesis hash`);
  if (i.cluster === "devnet") {
    if (i.realFundsEnabled) throw new Error("REAL_FUNDS_ENABLED is for mainnet-beta only");
    return c;
  }
  if (!i.realFundsEnabled) throw new Error("mainnet-beta needs REAL_FUNDS_ENABLED=true (15 §4.1)");
  if (!i.legalSignoff?.trim())
    throw new Error("mainnet-beta needs LEGAL_SIGNOFF: where the legal review is written down (15 §4.1)");
  if (i.bountyMint !== c.usdcMint) throw new Error("BOUNTY_MINT must be mainnet USDC on mainnet-beta");
  const reused = i.signerKeys.filter((k) => DEVNET_KEYS.includes(k));
  if (reused.length) throw new Error(`mainnet-beta refuses keys used on Devnet: ${reused.join(", ")}`);
  return c;
}
