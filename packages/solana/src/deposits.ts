// Self-service deposits (15 §4.3, 16 §6). A requester sends any enabled asset to the operator with a Solana Pay
// `reference` (a read-only account in the transfer); the server finds those transactions by the reference and
// credits them. SOL goes to the operator wallet; every other asset to the operator's token account of its mint.

import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type {
  Connection,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import type { ChainAsset } from "./adapter.ts";

export interface DepositAccount {
  asset: string;
  mint: string;
  /** Where this asset is received: the wallet for SOL, the operator's ATA of the mint otherwise. */
  account: string;
}

export interface DepositAddresses {
  /** The operator wallet: SOL goes here, and wallets derive each token account from it. */
  wallet: string;
  /** One row per enabled asset, registry order. */
  accounts: DepositAccount[];
}

export interface ChainDeposit {
  signature: string;
  slot: number;
  blockTime: number | null;
  asset: string;
  /** Base units of the asset (SOL: lamports). */
  amount: bigint;
  /** First signer of the transaction (the payer), for the deposit list. */
  from: string | null;
}

export const tokenProgramId = (p: ChainAsset["tokenProgram"]) =>
  p === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

/** The operator's receiving account of each asset. */
export function depositAccounts(operator: PublicKey, assets: ChainAsset[]): DepositAddresses {
  return {
    wallet: operator.toBase58(),
    accounts: assets.map((a) => ({
      asset: a.symbol,
      mint: a.mint,
      account: a.native
        ? operator.toBase58()
        : getAssociatedTokenAddressSync(
            new PublicKey(a.mint),
            operator,
            false,
            tokenProgramId(a.tokenProgram),
          ).toBase58(),
    })),
  };
}

/** Transfers to the operator in finalized transactions that carry `reference`, oldest first. */
export async function findDepositsByReference(
  connection: Connection,
  to: DepositAddresses,
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
  const out: ChainDeposit[] = [];
  txs.forEach((tx, i) => {
    const info = ok[i];
    if (!tx || !info || tx.meta?.err) return;
    const sums = sumTransfers(tx, to);
    const from = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58() ?? null;
    for (const { asset } of to.accounts) {
      const amount = sums.get(asset) ?? 0n;
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

const TOKEN_PROGRAMS = new Set(["spl-token", "spl-token-2022"]);
const TRANSFER_TYPES = new Set(["transfer", "transferChecked", "transferCheckedWithFee"]);

/**
 * Base units per asset, over top-level and inner instructions: lamports to the wallet count as SOL, a token
 * transfer to one of the operator's token accounts counts for that account's asset. A plain `transfer`
 * names no mint, so it is matched by the destination account alone; the account's mint is fixed by its address.
 */
export function sumTransfers(tx: ParsedTransactionWithMeta, to: DepositAddresses): Map<string, bigint> {
  const sums = new Map<string, bigint>();
  const add = (asset: string, v: bigint) => sums.set(asset, (sums.get(asset) ?? 0n) + v);
  const sol = to.accounts.find((a) => a.account === to.wallet)?.asset;
  const byAccount = new Map(to.accounts.filter((a) => a.account !== to.wallet).map((a) => [a.account, a]));
  const all: (ParsedInstruction | PartiallyDecodedInstruction)[] = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((x) => x.instructions),
  ];
  for (const ix of all) {
    if (!("parsed" in ix) || typeof ix.parsed !== "object" || ix.parsed === null) continue;
    const { type, info } = ix.parsed as { type?: string; info?: Record<string, unknown> };
    if (!info) continue;
    if (ix.program === "system" && type === "transfer" && info.destination === to.wallet) {
      if (sol) add(sol, BigInt(String(info.lamports ?? 0)));
    } else if (TOKEN_PROGRAMS.has(ix.program) && type && TRANSFER_TYPES.has(type)) {
      const dest = byAccount.get(String(info.destination));
      if (!dest) continue;
      // The checked forms name the mint; it must be the account's own (a mismatch cannot succeed on chain).
      if (type !== "transfer" && info.mint !== dest.mint) continue;
      const raw = BigInt(
        String((info.tokenAmount as { amount?: string } | undefined)?.amount ?? info.amount ?? 0),
      );
      // Token-2022 transfer fee: the account receives the amount less the fee withheld in it.
      const fee = BigInt(String((info.feeAmount as { amount?: string } | undefined)?.amount ?? 0));
      add(dest.asset, raw - fee);
    }
  }
  return sums;
}

/** Solana Pay transfer-request URLs (https://docs.solanapay.com/spec), one per asset. */
export function solanaPayUrls(a: DepositAddresses, reference: string, label = "ProofMarket") {
  const q = (extra: string) =>
    `solana:${a.wallet}?${extra}reference=${reference}&label=${encodeURIComponent(label)}`;
  return Object.fromEntries(
    a.accounts.map((x) => [x.asset, q(x.account === a.wallet ? "" : `spl-token=${x.mint}&`)]),
  ) as Record<string, string>;
}
