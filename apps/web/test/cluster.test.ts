// The gate in front of real money (15 §4.1, REQ-X-P-105): devnet by default, mainnet only behind three conditions.
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { CLUSTERS, checkClusterGate, DEVNET_KEYS, type GateInput } from "../lib/cluster";

const fresh = () => bs58.encode(randomBytes(32));
const devnet: GateInput = {
  cluster: "devnet",
  expectedGenesisHash: CLUSTERS.devnet.genesisHash,
  bountyMint: CLUSTERS.devnet.usdcMint,
  realFundsEnabled: false,
  legalSignoff: undefined,
  signerKeys: [...DEVNET_KEYS],
};
const mainnet: GateInput = {
  cluster: "mainnet-beta",
  expectedGenesisHash: CLUSTERS["mainnet-beta"].genesisHash,
  bountyMint: CLUSTERS["mainnet-beta"].usdcMint,
  realFundsEnabled: true,
  legalSignoff: "docs/legal/signoff.md",
  signerKeys: [fresh(), fresh()],
};

describe("checkClusterGate", () => {
  it("devnet starts as configured today, with the Devnet keys and any test mint", () => {
    expect(checkClusterGate(devnet).network).toBe("solana-devnet");
    expect(() => checkClusterGate({ ...devnet, bountyMint: fresh() })).not.toThrow();
  });

  it("refuses a genesis hash from the other cluster, either way", () => {
    expect(() => checkClusterGate({ ...devnet, expectedGenesisHash: mainnet.expectedGenesisHash })).toThrow(
      /genesis/,
    );
    expect(() => checkClusterGate({ ...mainnet, expectedGenesisHash: devnet.expectedGenesisHash })).toThrow(
      /genesis/,
    );
  });

  it("refuses REAL_FUNDS_ENABLED on devnet, so the flag cannot be left on by mistake", () => {
    expect(() => checkClusterGate({ ...devnet, realFundsEnabled: true })).toThrow(/mainnet-beta only/);
  });

  it("mainnet needs the flag, a legal sign-off, mainnet USDC and keys never used on Devnet", () => {
    expect(checkClusterGate(mainnet).network).toBe("solana");
    expect(() => checkClusterGate({ ...mainnet, realFundsEnabled: false })).toThrow(/REAL_FUNDS_ENABLED/);
    expect(() => checkClusterGate({ ...mainnet, legalSignoff: undefined })).toThrow(/LEGAL_SIGNOFF/);
    expect(() => checkClusterGate({ ...mainnet, legalSignoff: "  " })).toThrow(/LEGAL_SIGNOFF/);
    expect(() => checkClusterGate({ ...mainnet, bountyMint: CLUSTERS.devnet.usdcMint })).toThrow(/USDC/);
    expect(() => checkClusterGate({ ...mainnet, signerKeys: [fresh(), DEVNET_KEYS[1] ?? ""] })).toThrow(
      /used on Devnet/,
    );
  });
});
