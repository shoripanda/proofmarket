// PDA derivation (06 §2.2). Seeds must match programs/proofmarket/src/constants.rs.
import { PublicKey } from "@solana/web3.js";

export const SEEDS = {
  config: "config",
  task: "task",
  vault: "vault",
} as const;

export const MAX_RECIPIENTS = 5;

export function configPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(SEEDS.config)], programId);
}

/** seeds = ["task", task_id_hash] where task_id_hash = SHA-256("proofmarket:task:v1:" + verification_id). */
export function taskPda(programId: PublicKey, taskIdHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(SEEDS.task), Buffer.from(taskIdHash)], programId);
}

export function vaultPda(programId: PublicKey, task: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(SEEDS.vault), task.toBuffer()], programId);
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
