// On-chain facts (13 §2): find a result's Task account on Solana and check that a result matches it.
// Reads the account bytes directly (Anchor discriminator + Borsh), so no IDL or Anchor client is needed.
// Layout: programs/proofmarket/src/state.rs `Task`, constants.rs `MAX_RECIPIENTS`.

import { resultHash, resultHashInput, taskIdHash } from "@proofmarket/core";
import { Connection, PublicKey } from "@solana/web3.js";

/** The ProofMarket program on Solana Devnet. */
export const PROOFMARKET_PROGRAM_ID = "A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s";
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

/** sha256("account:Task")[0..8], as in packages/solana/idl/proofmarket.json. */
export const TASK_DISCRIMINATOR = Uint8Array.from([79, 34, 229, 55, 88, 90, 55, 84]);
export const MAX_RECIPIENTS = 5;
/** 8-byte discriminator + Task::INIT_SPACE. */
export const TASK_ACCOUNT_SIZE = 417;
/** Byte offsets in the account data, for readers that slice instead of decoding. */
export const TASK_OFFSETS = {
  task_id_hash: 11,
  status: 157,
  outcome: 158,
  evidence_root: 160,
  result_hash: 192,
  recipient_count: 224,
  finalized_at: 401,
} as const;

const TASK_STATUSES = ["FUNDED", "FINALIZED", "SETTLED", "REFUNDED"] as const;
const OUTCOMES = ["NONE", "VERIFIED", "NO_CONSENSUS", "INSUFFICIENT_WITNESSES"] as const;
const REFUND_REASONS = ["NONE", "CANCELLED", "EXPIRED"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type OnChainOutcome = (typeof OUTCOMES)[number];

export interface TaskAccount {
  version: number;
  task_id_hash: string;
  requester: string;
  requester_ref_hash: string;
  mint: string;
  /** Base units (USDC: 10^-6). */
  amount_per_witness: bigint;
  required_witnesses: number;
  quorum: number;
  /** Unix seconds. */
  deadline: number;
  status: TaskStatus;
  outcome: OnChainOutcome;
  refund_reason: (typeof REFUND_REASONS)[number];
  /** "sha256:<hex>", or null before finalize (all zero bytes). */
  evidence_root: string | null;
  result_hash: string | null;
  /** Wallets paid, in order. */
  recipients: string[];
  paid_total: bigint;
  /** Unix seconds; 0 when not reached. */
  created_at: number;
  finalized_at: number;
  closed_at: number;
}

const toPublicKey = (k: PublicKey | string) => (typeof k === "string" ? new PublicKey(k) : k);

/** seeds = ["task", sha256("proofmarket:task:v1:" + verification_id)] */
export function taskPda(
  verificationId: string,
  programId: PublicKey | string = PROOFMARKET_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("task"), Buffer.from(taskIdHash(verificationId))],
    toPublicKey(programId),
  )[0];
}

/** Solana Explorer page of an account on Devnet. */
export function explorerAccountUrl(address: PublicKey | string): string {
  return `https://explorer.solana.com/address/${address.toString()}?cluster=devnet`;
}

const hashOrNull = (b: Uint8Array) =>
  b.every((x) => x === 0) ? null : `sha256:${Buffer.from(b).toString("hex")}`;

function pick<T extends readonly string[]>(names: T, i: number, field: string): T[number] {
  const v = names[i];
  if (v === undefined) throw new Error(`unknown Task.${field} variant ${i}`);
  return v;
}

/** Decodes a Task account's raw data. Throws when the bytes are not a ProofMarket Task. */
export function decodeTaskAccount(data: Uint8Array): TaskAccount {
  if (data.length < TASK_ACCOUNT_SIZE)
    throw new Error(`Task account is ${TASK_ACCOUNT_SIZE} bytes, got ${data.length}`);
  if (!TASK_DISCRIMINATOR.every((b, i) => data[i] === b)) throw new Error("not a ProofMarket Task account");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const u8 = () => data[o++] as number;
  const bytes = (n: number) => {
    const b = data.subarray(o, o + n);
    o += n;
    return b;
  };
  const key = () => new PublicKey(bytes(32)).toBase58();
  const u64 = () => {
    const v = view.getBigUint64(o, true);
    o += 8;
    return v;
  };
  const i64 = () => {
    const v = Number(view.getBigInt64(o, true));
    o += 8;
    return v;
  };

  const version = u8();
  o += 2; // bump, vault_bump
  const task_id_hash = `sha256:${Buffer.from(bytes(32)).toString("hex")}`;
  const requester = key();
  const requester_ref_hash = `sha256:${Buffer.from(bytes(32)).toString("hex")}`;
  const mint = key();
  const amount_per_witness = u64();
  const required_witnesses = u8();
  const quorum = u8();
  const deadline = i64();
  const status = pick(TASK_STATUSES, u8(), "status");
  const outcome = pick(OUTCOMES, u8(), "outcome");
  const refund_reason = pick(REFUND_REASONS, u8(), "refund_reason");
  const evidence_root = hashOrNull(bytes(32));
  const result_hash = hashOrNull(bytes(32));
  const recipient_count = u8();
  const recipients = Array.from({ length: MAX_RECIPIENTS }, key).slice(0, recipient_count);
  return {
    version,
    task_id_hash,
    requester,
    requester_ref_hash,
    mint,
    amount_per_witness,
    required_witnesses,
    quorum,
    deadline,
    status,
    outcome,
    refund_reason,
    evidence_root,
    result_hash,
    recipients,
    paid_total: u64(),
    created_at: i64(),
    finalized_at: i64(),
    closed_at: i64(),
  };
}

/** Reads a Task account; null when it does not exist. Throws when another program owns the address. */
export async function readTaskAccount(
  rpcUrl: string,
  address: PublicKey | string,
  programId: PublicKey | string = PROOFMARKET_PROGRAM_ID,
): Promise<TaskAccount | null> {
  const info = await new Connection(rpcUrl, "confirmed").getAccountInfo(toPublicKey(address));
  if (!info) return null;
  if (!info.owner.equals(toPublicKey(programId)))
    throw new Error("account is not owned by the ProofMarket program");
  return decodeTaskAccount(info.data);
}

export interface VerifyOnChainInput {
  verificationId: string;
  /**
   * The `result` of GET /v1/verifications/{id}, or the body of GET /v1/public/verifications/{id}. The public
   * result leaves out `rejected_submissions`; it is then taken as `{}`, which is right when nothing was rejected
   * and otherwise gives `matches: false` (never a false match). It also leaves out `aggregate` (13 §4), so a form
   * result with a sense index only matches from the requester's result.
   */
  result: Record<string, unknown>;
  rpcUrl?: string;
  programId?: PublicKey | string;
}

export interface VerifyOnChainResult {
  /** True only when the hash recomputed from `result` equals the one finalized on chain. */
  matches: boolean;
  task_account: string;
  /** ISO time the program finalized the result; null when the account is missing or not finalized. */
  finalized_at: string | null;
  outcome: OnChainOutcome | null;
  evidence_root: string | null;
  /** The hash on chain. */
  result_hash: string | null;
  /** The hash recomputed from `result`. */
  computed_result_hash: string;
  /** Why it did not match, in one sentence; null when it matched. */
  reason: string | null;
}

/** Recomputes result_hash from `result` and compares it with the Task account on chain (13 §2). */
export async function verifyOnChain(input: VerifyOnChainInput): Promise<VerifyOnChainResult> {
  const programId = input.programId ?? PROOFMARKET_PROGRAM_ID;
  const address = taskPda(input.verificationId, programId);
  const account = await readTaskAccount(input.rpcUrl ?? DEVNET_RPC_URL, address, programId);
  return compareWithAccount(input.verificationId, input.result, address.toBase58(), account);
}

/** The comparison verifyOnChain makes, on an account already read (exported for tests and batch use). */
export function compareWithAccount(
  verificationId: string,
  result: Record<string, unknown>,
  taskAccount: string,
  account: TaskAccount | null,
): VerifyOnChainResult {
  const hashed = resultHashInput(result);
  const isPublic = !("rejected_submissions" in hashed);
  if (isPublic) hashed.rejected_submissions = {};
  const computed = `sha256:${Buffer.from(resultHash(hashed)).toString("hex")}`;
  const base = {
    task_account: taskAccount,
    finalized_at: account?.finalized_at ? new Date(account.finalized_at * 1000).toISOString() : null,
    outcome: account?.outcome ?? null,
    evidence_root: account?.evidence_root ?? null,
    result_hash: account?.result_hash ?? null,
    computed_result_hash: computed,
  };
  let reason: string | null = null;
  if (result.verification_id !== undefined && result.verification_id !== verificationId)
    reason = "result.verification_id is a different verification";
  else if (!account) reason = "no Task account at this address";
  else if (!account.result_hash) reason = "the result was never finalized on chain (refunded or still open)";
  else if (account.result_hash !== computed)
    reason = isPublic
      ? "hash differs; a public result has no rejected_submissions or aggregate, so pass the requester's result"
      : "hash differs: the result is not the one recorded on chain";
  return { ...base, matches: reason === null, reason };
}
