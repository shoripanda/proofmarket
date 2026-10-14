// The tokens a reward may be paid in (16 §3). One row per token; nothing outside this list is accepted.
// Mainnet mints, decimals and token programs were read from chain on 2026-10-14; scripts/check-assets.ts
// reads them again and must pass before a row is added or the program is deployed.
// Devnet and localnet take the mint from ASSET_MINT_<SYMBOL> (USDC: BOUNTY_MINT; SOL: the native mint).

export type TokenProgramName = "spl-token" | "token-2022";

export interface AssetInfo {
  /** `bounty.asset` in the API. */
  symbol: string;
  name: string;
  /** On-chain decimals. */
  decimals: number;
  tokenProgram: TokenProgramName;
  /** SOL only: escrowed as wSOL, paid to wallets as SOL (15 §3.1). */
  native?: true;
  mainnetMint?: string;
  /** A floor with a technical reason (SOL: the rent-exempt minimum of an empty wallet, 15 §3.2). */
  minBounty?: string;
  /** Whether the value moves with the market, so the pages can say so (16 §9). */
  volatile?: true;
}

export const NATIVE_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

export const ASSETS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    tokenProgram: "spl-token",
    mainnetMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  {
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    tokenProgram: "spl-token",
    native: true,
    mainnetMint: NATIVE_MINT_ADDRESS,
    minBounty: "0.001",
    volatile: true,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    tokenProgram: "spl-token",
    mainnetMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
  {
    symbol: "PYUSD",
    name: "PayPal USD",
    decimals: 6,
    tokenProgram: "token-2022",
    mainnetMint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
  },
  {
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
    tokenProgram: "token-2022",
    mainnetMint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    decimals: 6,
    tokenProgram: "spl-token",
    mainnetMint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    tokenProgram: "spl-token",
    mainnetMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    volatile: true,
  },
  {
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    tokenProgram: "spl-token",
    mainnetMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    volatile: true,
  },
  {
    symbol: "JitoSOL",
    name: "Jito Staked SOL",
    decimals: 9,
    tokenProgram: "spl-token",
    mainnetMint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    volatile: true,
  },
  {
    symbol: "mSOL",
    name: "Marinade Staked SOL",
    decimals: 9,
    tokenProgram: "spl-token",
    mainnetMint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    volatile: true,
  },
  {
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    tokenProgram: "spl-token",
    mainnetMint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
    volatile: true,
  },
] as const satisfies readonly AssetInfo[];

export type AssetSymbol = (typeof ASSETS)[number]["symbol"];
export const ASSET_SYMBOLS = ASSETS.map((a) => a.symbol) as [AssetSymbol, ...AssetSymbol[]];

export function assetInfo(symbol: string): AssetInfo | undefined {
  return (ASSETS as readonly AssetInfo[]).find((a) => a.symbol === symbol);
}

/** Like assetInfo, for values already validated (DB rows, parsed requests). Unknown is a bug. */
export function mustAsset(symbol: string): AssetInfo {
  const a = assetInfo(symbol);
  if (!a) throw new Error(`unknown asset ${symbol}`);
  return a;
}

/** Fraction digits an amount in this asset may have: its decimals, at most 6 (16 §4). */
export function amountDecimals(symbol: string): number {
  return Math.min(6, mustAsset(symbol).decimals);
}

/** An asset this server accepts, with the mint it uses on its cluster. */
export interface EnabledAsset {
  symbol: AssetSymbol;
  name: string;
  decimals: number;
  tokenProgram: TokenProgramName;
  native: boolean;
  mint: string;
  minBounty: string | null;
  volatile: boolean;
}

/**
 * ASSETS_ENABLED (comma separated; default USDC) plus SOL when SOL_ENABLED (15 §3.3), resolved to mints:
 * mainnet uses the registry, other clusters ASSET_MINT_<SYMBOL>. USDC is always BOUNTY_MINT and SOL always
 * the native mint. An enabled symbol with no mint, or not in the registry, throws: a typo must not start.
 */
export function resolveEnabledAssets(i: {
  cluster: "devnet" | "mainnet-beta";
  assetsEnabled: string | undefined;
  solEnabled: boolean;
  bountyMint: string;
  mintEnv: Record<string, string | undefined>;
}): EnabledAsset[] {
  const wanted = new Set(
    (i.assetsEnabled ?? "USDC")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (i.solEnabled) wanted.add("SOL");
  wanted.add("USDC");
  const out: EnabledAsset[] = [];
  for (const symbol of wanted) {
    const a = assetInfo(symbol);
    if (!a) throw new Error(`ASSETS_ENABLED: ${symbol} is not in the asset registry (16 §3.1)`);
    const mint =
      a.symbol === "USDC"
        ? i.bountyMint
        : a.native
          ? NATIVE_MINT_ADDRESS
          : i.cluster === "mainnet-beta"
            ? a.mainnetMint
            : i.mintEnv[`ASSET_MINT_${a.symbol.toUpperCase()}`];
    if (!mint)
      throw new Error(
        `ASSETS_ENABLED: no mint for ${symbol} on ${i.cluster} (set ASSET_MINT_${symbol.toUpperCase()})`,
      );
    out.push({
      symbol: a.symbol as AssetSymbol,
      name: a.name,
      decimals: a.decimals,
      tokenProgram: a.tokenProgram,
      native: a.native === true,
      mint,
      minBounty: a.minBounty ?? null,
      volatile: a.volatile === true,
    });
  }
  // registry order, so lists on the pages never depend on how the env was written
  return ASSET_SYMBOLS.flatMap((s) => out.filter((a) => a.symbol === s));
}
