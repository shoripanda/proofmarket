// Settlement Adapter contract (06 §4-5). The outbox jobs FUND_TASK / FINALIZE_AND_SETTLE / REFUND_TASK
// call exactly these methods. Every method is idempotent: it reads the Task account first and only
// sends a transaction if the on-chain state requires it (REQ-X-P-103).

import type { Outcome } from "@proofmarket/core";

export type OnChainTaskStatus = "Funded" | "Finalized" | "Settled" | "Refunded";
export type OnChainOutcome = "None" | "Verified" | "NoConsensus" | "InsufficientWitnesses";

export interface OnChainTask {
  address: string;
  status: OnChainTaskStatus;
  outcome: OnChainOutcome;
  amountPerWitness: bigint;
  requiredWitnesses: number;
  quorum: number;
  deadline: number;
  evidenceRoot: Uint8Array;
  resultHash: Uint8Array;
  recipients: string[]; // first recipient_count entries
  paidTotal: bigint;
}

export interface FundTaskInput {
  verificationId: string;
  taskIdHash: Uint8Array;
  requesterRefHash: Uint8Array;
  amountPerWitness: bigint; // base units
  requiredWitnesses: number;
  quorum: number;
  deadline: Date;
}

export interface FinalizeAndSettleInput {
  verificationId: string;
  taskIdHash: Uint8Array;
  outcome: Outcome; // VERIFIED | REJECTED(NO_CONSENSUS) | EXPIRED(INSUFFICIENT_WITNESSES)
  evidenceRoot: Uint8Array;
  resultHash: Uint8Array;
  /** Payout pubkeys of workers with VALID submissions (<= required_witnesses, unique). */
  recipients: string[];
}

export interface RefundInput {
  verificationId: string;
  taskIdHash: Uint8Array;
  reason: "Cancelled" | "Expired";
}

/** What the job records in payment_records. */
export type ChainResult =
  | { kind: "confirmed"; signature: string | null; alreadyDone: boolean; slot?: number }
  | { kind: "retry"; signature: string | null; error: string } // blockhash expired, RPC down, not finalized in 60 s
  | { kind: "halt"; error: string }; // must not continue automatically: on-chain/DB mismatch (I-SET-05), refund of a Finalized task

export interface SettlementAdapter {
  /** 06 §5.2: genesis hash == SOLANA_EXPECTED_GENESIS_HASH, Config matches env keys/mint. Throws otherwise. */
  assertSafeToStart(): Promise<void>;

  readTask(taskIdHash: Uint8Array): Promise<OnChainTask | null>;

  /** Task exists -> confirmed(alreadyDone). Else send [priority fee, initialize_task], wait for finalized. */
  fundTask(input: FundTaskInput, onSigned: (signature: string) => Promise<void>): Promise<ChainResult>;

  /**
   * Settled -> confirmed(alreadyDone). Finalized -> compare outcome/roots/recipients with input; mismatch -> halt;
   * match -> send settle only. Funded -> ensure recipient ATAs (separate tx), then [finalize_verification, settle].
   */
  finalizeAndSettle(
    input: FinalizeAndSettleInput,
    onSigned: (signature: string) => Promise<void>,
  ): Promise<ChainResult>;

  /** Refunded -> confirmed(alreadyDone). Finalized/Settled -> halt (never refund). Funded -> send refund. */
  refund(input: RefundInput, onSigned: (signature: string) => Promise<void>): Promise<ChainResult>;

  /** For alerting (06 §5.2): operator SOL and treasury token balances. */
  balances(): Promise<{ operatorLamports: bigint; treasuryAmount: bigint }>;
}

/** Real implementation over @anchor-lang/core + web3.js v1. PR-11. */
export function createSettlementAdapter(_cfg: {
  rpcUrl: string;
  expectedGenesisHash: string;
  programId: string;
  bountyMint: string;
  operatorSecretKey: Uint8Array;
  verifierSecretKey: Uint8Array;
}): SettlementAdapter {
  throw new Error("NOT_IMPLEMENTED: createSettlementAdapter (PR-11)");
}

/**
 * Dev-only stub used before PR-11 (10 §3, PR-06). Refuses to construct unless NODE_ENV !== "production"
 * and APP_ENV is "local" or "preview", so stub results can never reach the demo environment.
 */
export function createDevStubAdapter(_env: { appEnv: string; nodeEnv: string }): SettlementAdapter {
  throw new Error("NOT_IMPLEMENTED: createDevStubAdapter (PR-06)");
}
