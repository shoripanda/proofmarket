// Rising bounty (13 §1) over a task row: what is escrowed, what is still reserved, what is paid.
import { fundedPerWitnessMicro, type RisingBounty, settledPerWitnessMicro } from "@proofmarket/core";
import type { TaskRow } from "./task-engine";

type BountyCols = Pick<
  TaskRow,
  "bountyAmount" | "bountyMaxAmount" | "bountyRampMinutes" | "bountyFinalAmount" | "createdAt"
>;

export const bountyOf = (t: BountyCols): RisingBounty => ({
  amount: t.bountyAmount,
  maxAmount: t.bountyMaxAmount,
  rampMinutes: t.bountyRampMinutes,
  finalAmount: t.bountyFinalAmount,
  createdAt: t.createdAt,
});

/** Base units in the escrow (and in payment_records FUND / REFUND): the ceiling × witnesses. */
export const fundedMicro = (t: BountyCols & Pick<TaskRow, "requiredWitnesses">) =>
  fundedPerWitnessMicro(bountyOf(t)) * BigInt(t.requiredWitnesses);

/** Base units still held from the requester's balance: the escrow minus what came back at the first claim. */
export const reservedMicro = (t: BountyCols & Pick<TaskRow, "requiredWitnesses">) =>
  settledPerWitnessMicro(bountyOf(t)) * BigInt(t.requiredWitnesses);
