// x402 "exact" scheme on Solana (coinbase/x402 specs/schemes/exact/scheme_exact_svm.md, x402 v2).
// We are our own facilitator: verifyExactSvmPayment() enforces every facilitator MUST before the operator
// key co-signs as fee payer, and createX402Facilitator() submits and confirms the transaction.

import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export const X402_VERSION = 2;
/** CAIP-2: `solana:` + the first 32 characters of the genesis hash. */
export const caip2 = (genesisHash: string) => `solana:${genesisHash.slice(0, 32)}`;

const COMPUTE_BUDGET = ComputeBudgetProgram.programId.toBase58();
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const LIGHTHOUSE = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
/** The spec's reference cap: 5 lamports per compute unit. */
export const MAX_MICRO_LAMPORTS_PER_CU = 5_000_000n;
const TRANSFER_CHECKED = 12;

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  /** Atomic units (USDC: 6 decimals). */
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string; memo?: string };
}

export interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description?: string; mimeType?: string };
  accepted: PaymentRequirements;
  payload: { transaction: string };
}

export type VerifyFailure =
  | "invalid_payload"
  | "invalid_x402_version"
  | "invalid_scheme"
  | "invalid_network"
  | "invalid_payment_requirements"
  | "invalid_exact_svm_payload_instructions"
  | "invalid_exact_svm_payload_compute_price"
  | "invalid_exact_svm_payload_fee_payer"
  | "invalid_exact_svm_payload_mint"
  | "invalid_exact_svm_payload_recipient_mismatch"
  | "invalid_exact_svm_payload_amount_mismatch"
  | "invalid_exact_svm_payload_memo";

export type VerifyResult =
  | {
      ok: true;
      tx: VersionedTransaction;
      /** Owner of the source token account (the TransferChecked authority). */
      payer: string;
      source: string;
      amount: bigint;
    }
  | { ok: false; reason: VerifyFailure };

/** Parse the base64 `PAYMENT-SIGNATURE` header. Null when it is not a well-formed x402 payload. */
export function decodePaymentHeader(header: string): PaymentPayload | null {
  try {
    const p = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentPayload;
    if (typeof p !== "object" || p === null || typeof p.payload?.transaction !== "string") return null;
    if (typeof p.accepted !== "object" || p.accepted === null) return null;
    return p;
  } catch {
    return null;
  }
}

export const encodeHeader = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

/**
 * Every facilitator MUST of the exact SVM scheme, checked against what WE require (never the client's copy).
 * Stricter than the spec where it costs nothing: no address lookup tables, legacy SPL Token only (BOUNTY_MINT
 * lives there), exactly four TransferChecked accounts (no multisig), no Create ATA (our treasury exists).
 */
export function verifyExactSvmPayment(
  payload: PaymentPayload,
  req: PaymentRequirements,
  decimals: number,
): VerifyResult {
  if (payload.x402Version !== X402_VERSION) return { ok: false, reason: "invalid_x402_version" };
  const a = payload.accepted;
  if (a.scheme !== "exact") return { ok: false, reason: "invalid_scheme" };
  if (a.network !== req.network) return { ok: false, reason: "invalid_network" };
  if (
    a.amount !== req.amount ||
    a.asset !== req.asset ||
    a.payTo !== req.payTo ||
    a.extra?.feePayer !== req.extra.feePayer
  ) {
    return { ok: false, reason: "invalid_payment_requirements" };
  }

  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(payload.payload.transaction, "base64"));
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  const msg = tx.message;
  if (msg.addressTableLookups.length > 0) return { ok: false, reason: "invalid_payload" };
  const keys = msg.staticAccountKeys.map((k) => k.toBase58());
  const feePayer = req.extra.feePayer;
  // The fee payer is the first account and the only signature we add.
  if (keys[0] !== feePayer) return { ok: false, reason: "invalid_exact_svm_payload_fee_payer" };

  const ixs = msg.compiledInstructions.map((ix) => ({
    program: keys[ix.programIdIndex] ?? "",
    accounts: ix.accountKeyIndexes.map((i) => keys[i] ?? ""),
    data: Buffer.from(ix.data),
  }));
  if (ixs.length < 3 || ixs.length > 6)
    return { ok: false, reason: "invalid_exact_svm_payload_instructions" };
  // §2: the fee payer must not appear in any instruction's accounts (covers authority and source too).
  if (ixs.some((ix) => ix.accounts.includes(feePayer))) {
    return { ok: false, reason: "invalid_exact_svm_payload_fee_payer" };
  }

  const [limit, price, transfer, ...rest] = ixs;
  if (!limit || !price || !transfer) return { ok: false, reason: "invalid_exact_svm_payload_instructions" };
  // §3: [SetComputeUnitLimit (2), SetComputeUnitPrice (3)].
  if (limit.program !== COMPUTE_BUDGET || limit.data[0] !== 2 || limit.data.length !== 5) {
    return { ok: false, reason: "invalid_exact_svm_payload_instructions" };
  }
  if (price.program !== COMPUTE_BUDGET || price.data[0] !== 3 || price.data.length !== 9) {
    return { ok: false, reason: "invalid_exact_svm_payload_instructions" };
  }
  if (price.data.readBigUInt64LE(1) > MAX_MICRO_LAMPORTS_PER_CU) {
    return { ok: false, reason: "invalid_exact_svm_payload_compute_price" };
  }

  // §4, §6: TransferChecked(amount, decimals) with accounts [source, mint, destination, authority].
  if (
    transfer.program !== TOKEN_PROGRAM_ID.toBase58() ||
    transfer.data.length !== 10 ||
    transfer.data[0] !== TRANSFER_CHECKED ||
    transfer.accounts.length !== 4
  ) {
    return { ok: false, reason: "invalid_exact_svm_payload_instructions" };
  }
  const [source, mint, destination, authority] = transfer.accounts as [string, string, string, string];
  if (mint !== req.asset || transfer.data[9] !== decimals) {
    return { ok: false, reason: "invalid_exact_svm_payload_mint" };
  }
  const expectedDest = getAssociatedTokenAddressSync(
    new PublicKey(req.asset),
    new PublicKey(req.payTo),
    true,
  ).toBase58();
  if (destination !== expectedDest)
    return { ok: false, reason: "invalid_exact_svm_payload_recipient_mismatch" };
  const amount = transfer.data.readBigUInt64LE(1);
  if (amount !== BigInt(req.amount))
    return { ok: false, reason: "invalid_exact_svm_payload_amount_mismatch" };

  // §1: up to three trailing Lighthouse / Memo instructions; with extra.memo, exactly one matching Memo.
  if (rest.some((ix) => ix.program !== MEMO && ix.program !== LIGHTHOUSE)) {
    return { ok: false, reason: "invalid_exact_svm_payload_instructions" };
  }
  if (req.extra.memo !== undefined) {
    const memos = rest.filter((ix) => ix.program === MEMO);
    if (memos.length !== 1 || memos[0]?.data.toString("utf8") !== req.extra.memo) {
      return { ok: false, reason: "invalid_exact_svm_payload_memo" };
    }
  }
  return { ok: true, tx, payer: authority, source, amount };
}

/** What the endpoint needs from the chain. Tests replace it with a fake. */
export interface X402Facilitator {
  /** network / asset / payTo / feePayer for PaymentRequirements. */
  readonly network: string;
  readonly asset: string;
  readonly payTo: string;
  readonly feePayer: string;
  readonly decimals: number;
  /** §5: the source token account must exist (our destination, the treasury, always does). */
  accountExists(address: string): Promise<boolean>;
  /** The transaction id once the fee payer has signed (deterministic: ed25519 over the same message). */
  signatureOf(tx: VersionedTransaction): string;
  /**
   * Co-sign as fee payer, send, and wait for `confirmed`. Safe to call again for the same transaction:
   * if it already landed, that is reported as success instead of sending again.
   */
  settle(tx: VersionedTransaction): Promise<{ ok: true; signature: string } | { ok: false; error: string }>;
}

export function createX402Facilitator(cfg: {
  rpcUrl: string;
  expectedGenesisHash: string;
  bountyMint: string;
  operatorSecretKey: Uint8Array;
  confirmTimeoutMs?: number;
}): X402Facilitator {
  const connection = new Connection(cfg.rpcUrl, { commitment: "confirmed" });
  const operator = Keypair.fromSecretKey(cfg.operatorSecretKey);
  const timeoutMs = cfg.confirmTimeoutMs ?? 45_000;
  let genesisChecked = false;

  function sign(tx: VersionedTransaction): string {
    tx.sign([operator]);
    return bs58encode(tx.signatures[0] ?? new Uint8Array());
  }

  async function landed(signature: string): Promise<"ok" | "failed" | "unknown"> {
    const s = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }))
      .value[0];
    if (!s) return "unknown";
    if (s.err) return "failed";
    return s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized" ? "ok" : "unknown";
  }

  return {
    network: caip2(cfg.expectedGenesisHash),
    asset: cfg.bountyMint,
    payTo: operator.publicKey.toBase58(),
    feePayer: operator.publicKey.toBase58(),
    decimals: 6,
    async accountExists(address) {
      return (await connection.getAccountInfo(new PublicKey(address), "confirmed")) !== null;
    },
    signatureOf(tx) {
      const copy = VersionedTransaction.deserialize(tx.serialize());
      return sign(copy);
    },
    async settle(tx) {
      if (!genesisChecked) {
        const g = await connection.getGenesisHash();
        if (g !== cfg.expectedGenesisHash) return { ok: false, error: `unexpected cluster ${g}` };
        genesisChecked = true;
      }
      const signature = sign(tx);
      try {
        const before = await landed(signature);
        if (before === "ok") return { ok: true, signature };
        if (before === "failed") return { ok: false, error: "transaction failed on chain" };
        await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const s = await landed(signature);
          if (s === "ok") return { ok: true, signature };
          if (s === "failed") return { ok: false, error: "transaction failed on chain" };
          await new Promise((r) => setTimeout(r, 1000));
        }
        return { ok: false, error: "not confirmed in time" };
      } catch (e) {
        // A resend of a transaction that already landed is rejected by preflight; check before failing.
        if ((await landed(signature).catch(() => "unknown")) === "ok") return { ok: true, signature };
        return { ok: false, error: String(e).slice(0, 300) };
      }
    },
  };
}

/**
 * Never touches a network: co-signs and reports success. For DEV_MODE (APP_ENV=local, whose chain is in memory
 * too) and as the base of the test fake. Refused unless the caller says it is local.
 */
export function createOfflineX402Facilitator(cfg: {
  appEnv: string;
  /** 32-byte ed25519 seed. */
  operatorSeed: Uint8Array;
  bountyMint: string;
  genesisHash: string;
}): X402Facilitator {
  if (cfg.appEnv !== "local" && cfg.appEnv !== "test")
    throw new Error("offline x402 facilitator is local-only");
  const operator = Keypair.fromSeed(cfg.operatorSeed);
  const sign = (tx: VersionedTransaction) => {
    tx.sign([operator]);
    return bs58encode(tx.signatures[0] ?? new Uint8Array());
  };
  return {
    network: caip2(cfg.genesisHash),
    asset: cfg.bountyMint,
    payTo: operator.publicKey.toBase58(),
    feePayer: operator.publicKey.toBase58(),
    decimals: 6,
    async accountExists() {
      return true;
    },
    signatureOf: (tx) => sign(VersionedTransaction.deserialize(tx.serialize())),
    async settle(tx) {
      return { ok: true, signature: sign(tx) };
    },
  };
}

/**
 * Client side (scripts/x402-agent.ts and tests): build the transaction the scheme expects and sign it as the
 * token owner. The fee payer's signature slot stays empty for the facilitator.
 */
export function buildExactSvmPayment(o: {
  requirements: PaymentRequirements;
  owner: Keypair;
  recentBlockhash: string;
  decimals: number;
  /** Defaults to a random 16-byte hex nonce (the spec's uniqueness memo). */
  memo?: string;
  computeUnitPrice?: bigint;
  /** Test hooks: override what goes on the wire. */
  amount?: bigint;
  destination?: PublicKey;
  mint?: PublicKey;
  extraInstructions?: TransactionInstruction[];
}): string {
  const r = o.requirements;
  const mint = o.mint ?? new PublicKey(r.asset);
  const source = getAssociatedTokenAddressSync(mint, o.owner.publicKey);
  const destination =
    o.destination ?? getAssociatedTokenAddressSync(new PublicKey(r.asset), new PublicKey(r.payTo), true);
  const memo = o.memo ?? r.extra.memo ?? randomHex(16);
  const msg = new TransactionMessage({
    payerKey: new PublicKey(r.extra.feePayer),
    recentBlockhash: o.recentBlockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: o.computeUnitPrice ?? 1n }),
      createTransferCheckedInstruction(
        source,
        mint,
        destination,
        o.owner.publicKey,
        o.amount ?? BigInt(r.amount),
        o.decimals,
      ),
      new TransactionInstruction({
        programId: new PublicKey(MEMO),
        keys: [],
        data: Buffer.from(memo, "utf8"),
      }),
      ...(o.extraInstructions ?? []),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([o.owner]);
  return Buffer.from(tx.serialize()).toString("base64");
}

function randomHex(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString("hex");
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58encode(bytes: Uint8Array): string {
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
