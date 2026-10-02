// PDA derivation (06 §2.2). Seeds must match programs/proofmarket/src/constants.rs.
import type { PublicKey } from "@solana/web3.js";

export const SEEDS = {
  config: "config",
  task: "task",
  vault: "vault",
} as const;

export const MAX_RECIPIENTS = 5;

export function configPda(_programId: PublicKey): [PublicKey, number] {
  throw new Error("NOT_IMPLEMENTED: configPda (PR-11)");
}

/** seeds = ["task", task_id_hash] where task_id_hash = SHA-256("proofmarket:task:v1:" + verification_id). */
export function taskPda(_programId: PublicKey, _taskIdHash: Uint8Array): [PublicKey, number] {
  throw new Error("NOT_IMPLEMENTED: taskPda (PR-11)");
}

export function vaultPda(_programId: PublicKey, _task: PublicKey): [PublicKey, number] {
  throw new Error("NOT_IMPLEMENTED: vaultPda (PR-11)");
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
