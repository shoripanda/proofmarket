// 16 §3-4: the asset registry, enabling assets per server, and base units per asset.
import { describe, expect, it } from "vitest";
import {
  ASSET_SYMBOLS,
  ASSETS,
  amountDecimals,
  fromBaseUnits,
  NATIVE_MINT_ADDRESS,
  resolveEnabledAssets,
  toBaseUnits,
} from "../src/index.ts";
import { AssetSchema } from "../src/schemas/api.ts";

const base = { cluster: "devnet" as const, solEnabled: false, bountyMint: "DevUsdc", mintEnv: {} };

describe("registry", () => {
  it("has unique symbols and mainnet mints, and the API accepts exactly those symbols", () => {
    expect(new Set(ASSET_SYMBOLS).size).toBe(ASSETS.length);
    const mints = ASSETS.map((a) => a.mainnetMint);
    expect(new Set(mints).size).toBe(mints.length);
    for (const s of ASSET_SYMBOLS) expect(AssetSchema.safeParse(s).success).toBe(true);
    expect(AssetSchema.safeParse("DOGE").success).toBe(false);
  });

  it("allows as many fraction digits as the token has, never more than 6", () => {
    expect(amountDecimals("USDC")).toBe(6);
    expect(amountDecimals("SOL")).toBe(6);
    expect(amountDecimals("BONK")).toBe(5);
    expect(amountDecimals("cbBTC")).toBe(6);
  });
});

describe("resolveEnabledAssets", () => {
  it("is USDC alone by default, on BOUNTY_MINT", () => {
    expect(
      resolveEnabledAssets({ ...base, assetsEnabled: undefined }).map((a) => [a.symbol, a.mint]),
    ).toEqual([["USDC", "DevUsdc"]]);
  });

  it("adds SOL for SOL_ENABLED, on the native mint, and keeps registry order", () => {
    const a = resolveEnabledAssets({
      ...base,
      assetsEnabled: "BONK,USDC",
      solEnabled: true,
      mintEnv: { ASSET_MINT_BONK: "B" },
    });
    expect(a.map((x) => x.symbol)).toEqual(["USDC", "SOL", "BONK"]);
    expect(a[1]).toMatchObject({ mint: NATIVE_MINT_ADDRESS, native: true, minBounty: "0.001" });
  });

  it("uses the registry mints on mainnet and ASSET_MINT_<SYMBOL> elsewhere", () => {
    const main = resolveEnabledAssets({ ...base, cluster: "mainnet-beta", assetsEnabled: "PYUSD,JitoSOL" });
    expect(main.find((a) => a.symbol === "PYUSD")).toMatchObject({
      mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
      tokenProgram: "token-2022",
    });
    const dev = resolveEnabledAssets({
      ...base,
      assetsEnabled: "JitoSOL",
      mintEnv: { ASSET_MINT_JITOSOL: "J" },
    });
    expect(dev.find((a) => a.symbol === "JitoSOL")?.mint).toBe("J");
  });

  it("refuses to start on a symbol it does not know or cannot find a mint for", () => {
    expect(() => resolveEnabledAssets({ ...base, assetsEnabled: "USDC,DOGE" })).toThrow(
      /not in the asset registry/,
    );
    expect(() => resolveEnabledAssets({ ...base, assetsEnabled: "USDT" })).toThrow(/ASSET_MINT_USDT/);
  });
});

describe("base units", () => {
  it("scales up for tokens with more than 6 decimals and down for fewer", () => {
    expect(toBaseUnits(500_000n, "USDC")).toBe(500_000n);
    expect(toBaseUnits(1_000n, "SOL")).toBe(1_000_000n);
    expect(toBaseUnits(1_000_000n, "cbBTC")).toBe(100_000_000n);
    expect(toBaseUnits(1_234_560n, "BONK")).toBe(123_456n);
  });

  it("refuses an amount finer than the token allows", () => {
    expect(() => toBaseUnits(1n, "BONK")).toThrow(/finer than BONK/);
  });

  it("rounds deposits down to micro units, and scales BONK up", () => {
    expect(fromBaseUnits(1_999n, "SOL")).toBe(1n);
    expect(fromBaseUnits(123_456n, "BONK")).toBe(1_234_560n);
  });

  it("throws on an unknown asset", () => {
    expect(() => toBaseUnits(1n, "DOGE")).toThrow(/unknown asset/);
  });
});
