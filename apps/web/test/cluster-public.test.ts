import { describe, expect, it } from "vitest";
import { clusterText } from "../lib/cluster-public";

describe("clusterText", () => {
  it("names Devnet and links to the devnet explorer", () => {
    const t = clusterText("devnet");
    expect(t.network).toBe("solana-devnet");
    expect(t.chain).toBe("Solana Devnet");
    expect(t.explorerTx("abc")).toBe("https://explorer.solana.com/tx/abc?cluster=devnet");
    expect(t.solscanTx("abc")).toBe("https://solscan.io/tx/abc?cluster=devnet");
    expect(t.publicRpc).toContain("devnet");
  });

  it("on mainnet says just Solana and drops the cluster query", () => {
    const t = clusterText("mainnet-beta");
    expect(t.network).toBe("solana");
    expect(t.chain).toBe("Solana");
    expect(t.suffix).toBe("");
    expect(t.explorerTx("abc")).toBe("https://explorer.solana.com/tx/abc");
    expect(t.usdcMint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  });
});
