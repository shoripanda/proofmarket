import "server-only";
// docs/architecture 07 §4.2: which submissions must wait for the operator before anything is paid.
import { fundedPerWitnessMicro } from "@proofmarket/core";
import type { AppContext } from "../context";
import { bountyOf } from "./bounty";
import type { TaskRow } from "./task-engine";

/**
 * The total reward (amount × witnesses; the ceiling of a rising bounty) is at or above HUMAN_REVIEW_MIN_TOTAL
 * for its asset, so no AI verdict alone may pay it. These submissions are not released after the 30-minute
 * wait either: they wait for the operator or for the deadline.
 */
export function needsOperatorReview(app: Pick<AppContext, "config">, task: TaskRow): boolean {
  const min = app.config.humanReviewMin[task.bountyAsset];
  if (min === undefined) return false;
  const total = fundedPerWitnessMicro(bountyOf(task)) * BigInt(task.requiredWitnesses);
  return total >= min;
}
