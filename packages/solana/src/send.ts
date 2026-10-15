// Sending a transaction so it lands under load (16 §7.3): a confirmed blockhash, a priority fee read from
// recent fees on the accounts it writes, a compute-unit limit from a simulation, and a rebroadcast every
// 2 s until the transaction reaches the wanted commitment or its blockhash expires.

import {
  ComputeBudgetProgram,
  type Connection,
  type Finality,
  type PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { type Signer, signTransaction } from "./signer.ts";

export type SendConnection = Pick<
  Connection,
  | "getLatestBlockhash"
  | "getRecentPrioritizationFees"
  | "simulateTransaction"
  | "sendRawTransaction"
  | "getSignatureStatuses"
  | "getBlockHeight"
>;

export interface SendOptions {
  /** `finalized` before money is reported moved (06 §5.1); `confirmed` for idempotent setup such as ATAs. */
  commitment: Finality;
  timeoutMs: number;
  /** Floor and ceiling for the compute-unit price, in micro-lamports. */
  minPriorityMicroLamports: number;
  maxPriorityMicroLamports: number;
  /** Test hooks. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type SendResult =
  | { ok: true; signature: string }
  | { ok: false; signature: string | null; error: string };

/** Rebroadcast interval and status poll interval. */
export const REBROADCAST_MS = 2_000;
export const POLL_MS = 1_000;
/** Used when the simulation returns no unit count; the runtime maximum per transaction. */
const MAX_CU = 1_400_000;

/** p-th percentile (0..1) of the values, 0 for none. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
}

/** The 75th percentile of recent fees on these accounts, kept within [min, max]. */
export function priorityFee(recent: number[], min: number, max: number): number {
  return Math.min(max, Math.max(min, percentile(recent, 0.75)));
}

/** Units the simulation used, plus 20 % and room for the two compute-budget instructions. */
export function computeUnitLimit(unitsConsumed: number | undefined): number {
  if (!unitsConsumed) return MAX_CU;
  return Math.min(MAX_CU, Math.ceil(unitsConsumed * 1.2) + 1_000);
}

const RANK: Record<string, number> = { processed: 0, confirmed: 1, finalized: 2 };

/** Writable, non-signer accounts: the ones whose recent fees say how contested this transaction is. */
function writableAccounts(ixs: TransactionInstruction[]): PublicKey[] {
  const seen = new Map<string, PublicKey>();
  for (const ix of ixs)
    for (const k of ix.keys) if (k.isWritable && !k.isSigner) seen.set(k.pubkey.toBase58(), k.pubkey);
  return [...seen.values()].slice(0, 128);
}

/**
 * Sign, report the signature (before anything is sent, 06 §5.1 step 2), then send and resend until the
 * transaction reaches `commitment`, fails, its blockhash expires or `timeoutMs` passes. A failed simulation
 * returns before signing, so no signature is recorded for a transaction that was never sent.
 */
export async function sendAndConfirm(
  connection: SendConnection,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  signers: readonly Signer[],
  onSigned: (signature: string) => Promise<void>,
  o: SendOptions,
): Promise<SendResult> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const latest = await connection.getLatestBlockhash("confirmed");
  const fees = await connection
    .getRecentPrioritizationFees({ lockedWritableAccounts: writableAccounts(ixs) })
    .then((r) => r.map((f) => f.prioritizationFee))
    .catch(() => [] as number[]);
  const price = priorityFee(fees, o.minPriorityMicroLamports, o.maxPriorityMicroLamports);
  const build = (units: number) => {
    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: latest.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
        ...ixs,
      ],
    }).compileToV0Message();
    return new VersionedTransaction(msg);
  };

  const sim = await connection.simulateTransaction(build(MAX_CU), {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
  });
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).slice(-6).join(" | ");
    return {
      ok: false,
      signature: null,
      error: `simulation: ${JSON.stringify(sim.value.err)} ${logs}`.slice(0, 500),
    };
  }
  const tx = build(computeUnitLimit(sim.value.unitsConsumed));
  await signTransaction(tx, signers);
  const signature = bs58encode(tx.signatures[0] ?? new Uint8Array());
  await onSigned(signature);
  const raw = tx.serialize();

  const start = now();
  let nextSend = start;
  let sendError = "";
  for (let polls = 0; ; polls++) {
    if (now() >= nextSend) {
      await connection
        .sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 })
        .then(() => {
          sendError = "";
        })
        .catch((e) => {
          sendError = String(e).slice(0, 200);
        });
      nextSend = now() + REBROADCAST_MS;
    }
    const status = await connection
      .getSignatureStatuses([signature])
      .then((r) => r.value[0] ?? null)
      .catch(() => null);
    if (status?.err) return { ok: false, signature, error: `tx error: ${JSON.stringify(status.err)}` };
    if (status && (RANK[status.confirmationStatus ?? "processed"] ?? 0) >= (RANK[o.commitment] ?? 2))
      return { ok: true, signature };
    if (now() - start > o.timeoutMs)
      return {
        ok: false,
        signature,
        error: `not ${o.commitment} within timeout${sendError ? `: ${sendError}` : ""}`,
      };
    // Landed but not yet final: keep waiting. Not landed: stop once the blockhash can no longer be used.
    if (!status && polls % 3 === 2) {
      const height = await connection.getBlockHeight("confirmed").catch(() => 0);
      if (height > latest.lastValidBlockHeight) return { ok: false, signature, error: "blockhash expired" };
    }
    await sleep(POLL_MS);
  }
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function bs58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}
