// Self-service deposits (15 §4.3). A requester sends USDC or SOL to the operator with a Solana Pay `reference`
// (a read-only account in the transfer); the server finds those transactions by the reference and credits them.

import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type {
  Connection,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

export interface DepositAddresses {
  /** The operator wallet: SOL goes here, and wallets derive the USDC token account from it. */
  wallet: string;
  /** The operator's USDC token account (Config.treasury). */
  usdcAccount: string;
  usdcMint: string;
}

export interface ChainDeposit {
  signature: string;
  slot: number;
  blockTime: number | null;
  asset: "USDC" | "SOL";
  /** Base units: USDC 10^-6, SOL lamports. */
  amount: bigint;
  /** First signer of the transaction (the payer), for the deposit list. */
  from: string | null;
}

/** Transfers to the treasury in finalized transactions that carry `reference`, oldest first. */
export async function findDepositsByReference(
  connection: Connection,
  cfg: { operator: PublicKey; usdcMint: PublicKey },
  reference: string,
  until?: string,
  limit = 50,
): Promise<ChainDeposit[]> {
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey(reference),
    { limit, ...(until ? { until } : {}) },
    "finalized",
  );
  const ok = sigs.filter((s) => !s.err);
  if (!ok.length) return [];
  const txs = await connection.getParsedTransactions(
    ok.map((s) => s.signature),
    { commitment: "finalized", maxSupportedTransactionVersion: 0 },
  );
  const usdcAccount = getAssociatedTokenAddressSync(cfg.usdcMint, cfg.operator).toBase58();
  const wallet = cfg.operator.toBase58();
  const out: ChainDeposit[] = [];
  txs.forEach((tx, i) => {
    const info = ok[i];
    if (!tx || !info || tx.meta?.err) return;
    const sums = sumTransfers(tx, { wallet, usdcAccount });
    const from = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58() ?? null;
    for (const asset of ["USDC", "SOL"] as const) {
      const amount = sums[asset];
      if (amount > 0n)
        out.push({
          signature: info.signature,
          slot: info.slot,
          blockTime: info.blockTime ?? null,
          asset,
          amount,
          from,
        });
    }
  });
  // getSignaturesForAddress returns newest first.
  return out.reverse();
}

/** Lamports to the wallet and USDC base units to its token account, over top-level and inner instructions. */
function sumTransfers(
  tx: ParsedTransactionWithMeta,
  to: { wallet: string; usdcAccount: string },
): { USDC: bigint; SOL: bigint } {
  const sums = { USDC: 0n, SOL: 0n };
  const all: (ParsedInstruction | PartiallyDecodedInstruction)[] = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((x) => x.instructions),
  ];
  for (const ix of all) {
    if (!("parsed" in ix) || typeof ix.parsed !== "object" || ix.parsed === null) continue;
    const { type, info } = ix.parsed as { type?: string; info?: Record<string, unknown> };
    if (!info) continue;
    if (ix.program === "system" && type === "transfer" && info.destination === to.wallet) {
      sums.SOL += BigInt(String(info.lamports ?? 0));
    } else if (
      ix.program === "spl-token" &&
      (type === "transfer" || type === "transferChecked") &&
      info.destination === to.usdcAccount
    ) {
      const raw = (info.tokenAmount as { amount?: string } | undefined)?.amount ?? info.amount;
      sums.USDC += BigInt(String(raw ?? 0));
    }
  }
  return sums;
}

/** Solana Pay transfer-request URLs (https://docs.solanapay.com/spec) for the two assets. */
export function solanaPayUrls(a: DepositAddresses, reference: string, label = "ProofMarket") {
  const q = (extra: string) =>
    `solana:${a.wallet}?${extra}reference=${reference}&label=${encodeURIComponent(label)}`;
  return { SOL: q(""), USDC: q(`spl-token=${a.usdcMint}&`) };
}
