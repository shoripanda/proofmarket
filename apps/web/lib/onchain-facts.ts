// How another program reads a result's Task account (13 §2). Shared by GET /v1/public/verifications/{id}/onchain
// and the "read it from a program" section of /r/{id}. Offsets are pinned in packages/sdk/test/onchain.test.ts.
import { TASK_OFFSETS } from "@proofmarket/sdk/onchain";

/** API outcome (verification_results.outcome) -> the Outcome the program stores (settlement-jobs OUTCOME). */
export const ONCHAIN_OUTCOME = {
  VERIFIED: "VERIFIED",
  REJECTED: "NO_CONSENSUS",
  EXPIRED: "INSUFFICIENT_WITNESSES",
} as const;

/** About ten lines each: Rust inside an Anchor program, TypeScript with @solana/web3.js only. */
export function howToRead(verificationId: string, programId: string) {
  const rust = [
    "use anchor_lang::prelude::*; // brings AccountDeserialize",
    'use proofmarket::state::{Outcome, Task}; // proofmarket = { features = ["cpi"] }',
    "",
    '// task: the account at PDA ["task", sha256("proofmarket:task:v1:" + verification_id)]',
    "require_keys_eq!(*task.owner, proofmarket::ID);",
    "let data = task.try_borrow_data()?;",
    "let t = Task::try_deserialize(&mut &data[..])?; // checks the 8-byte discriminator",
    "require!(t.outcome == Outcome::Verified, MyError::NotVerified);",
    "require!(t.result_hash == expected_result_hash, MyError::OtherResult);",
    "let checked_at = t.finalized_at; // unix seconds",
  ].join("\n");
  const typescript = [
    'import { createHash } from "node:crypto";',
    'import { Connection, PublicKey } from "@solana/web3.js";',
    "",
    `const id = "${verificationId}";`,
    `const seed = createHash("sha256").update("proofmarket:task:v1:" + id).digest();`,
    `const [task] = PublicKey.findProgramAddressSync([Buffer.from("task"), seed], new PublicKey("${programId}"));`,
    'const { data } = (await new Connection("https://api.devnet.solana.com").getAccountInfo(task))!;',
    `const outcome = ["NONE", "VERIFIED", "NO_CONSENSUS", "INSUFFICIENT_WITNESSES"][data[${TASK_OFFSETS.outcome}]];`,
    `const resultHash = "sha256:" + data.subarray(${TASK_OFFSETS.result_hash}, ${TASK_OFFSETS.result_hash + 32}).toString("hex");`,
    `const finalizedAt = Number(data.readBigInt64LE(${TASK_OFFSETS.finalized_at})); // unix seconds`,
  ].join("\n");
  return { rust, typescript };
}
