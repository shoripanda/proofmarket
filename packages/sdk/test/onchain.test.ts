// 13 §2: reading the Task account without Anchor, and matching a result against it.
// Fixtures are real Devnet accounts and the public results of the same verifications (2026-10-08).
// PM_DEVNET=1 also reads the live account over RPC.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resultHash, taskIdHash } from "@proofmarket/core";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  compareWithAccount,
  DEVNET_RPC_URL,
  decodeTaskAccount,
  TASK_ACCOUNT_SIZE,
  TASK_DISCRIMINATOR,
  TASK_OFFSETS,
  taskPda,
  verifyOnChain,
} from "../src/onchain.ts";

interface Fixture {
  verification_id: string;
  task_account: string;
  account_data_base64: string;
  public_result: Record<string, unknown>;
}
const load = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8")) as Fixture;
const settled = load("devnet-settled.json");
const refunded = load("devnet-refunded.json");
const bytes = (f: Fixture) => new Uint8Array(Buffer.from(f.account_data_base64, "base64"));

/** A Task account written field by field in state.rs order, independent of the decoder. */
function handMade() {
  const b = Buffer.alloc(TASK_ACCOUNT_SIZE);
  let o = 0;
  const put = (x: Uint8Array) => {
    b.set(x, o);
    o += x.length;
  };
  const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
  put(TASK_DISCRIMINATOR);
  put(Uint8Array.from([1, 254, 253])); // version, bump, vault_bump
  put(taskIdHash("ver_hand"));
  put(key(1).toBytes()); // requester
  put(new Uint8Array(32).fill(2)); // requester_ref_hash
  put(key(3).toBytes()); // mint
  o = b.writeBigUInt64LE(500_000n, o);
  put(Uint8Array.from([2, 2])); // required_witnesses, quorum
  o = b.writeBigInt64LE(1_760_000_000n, o);
  put(Uint8Array.from([2, 1, 0])); // Settled, Verified, None
  put(new Uint8Array(32).fill(0xaa)); // evidence_root
  put(new Uint8Array(32).fill(0xbb)); // result_hash
  b[o++] = 2; // recipient_count
  for (let i = 0; i < 5; i++) put(i < 2 ? key(10 + i).toBytes() : new Uint8Array(32));
  o = b.writeBigUInt64LE(1_000_000n, o);
  o = b.writeBigInt64LE(1_759_990_000n, o);
  o = b.writeBigInt64LE(1_759_995_000n, o);
  o = b.writeBigInt64LE(1_759_995_001n, o);
  expect(o).toBe(TASK_ACCOUNT_SIZE);
  return { b, key };
}

describe("decodeTaskAccount", () => {
  it("reads every field of a hand-built account", () => {
    const { b, key } = handMade();
    const t = decodeTaskAccount(b);
    expect(t).toMatchObject({
      version: 1,
      task_id_hash: `sha256:${Buffer.from(taskIdHash("ver_hand")).toString("hex")}`,
      requester: key(1).toBase58(),
      mint: key(3).toBase58(),
      amount_per_witness: 500_000n,
      required_witnesses: 2,
      quorum: 2,
      deadline: 1_760_000_000,
      status: "SETTLED",
      outcome: "VERIFIED",
      refund_reason: "NONE",
      evidence_root: `sha256:${"aa".repeat(32)}`,
      result_hash: `sha256:${"bb".repeat(32)}`,
      recipients: [key(10).toBase58(), key(11).toBase58()],
      paid_total: 1_000_000n,
      created_at: 1_759_990_000,
      finalized_at: 1_759_995_000,
      closed_at: 1_759_995_001,
    });
  });

  it("TASK_OFFSETS point at the same bytes the decoder reads", () => {
    const { b } = handMade();
    const at = (o: number) => b.subarray(o, o + 32).toString("hex");
    expect(at(TASK_OFFSETS.task_id_hash)).toBe(Buffer.from(taskIdHash("ver_hand")).toString("hex"));
    expect([b[TASK_OFFSETS.status], b[TASK_OFFSETS.outcome], b[TASK_OFFSETS.recipient_count]]).toEqual([
      2, 1, 2,
    ]);
    expect(at(TASK_OFFSETS.evidence_root)).toBe("aa".repeat(32));
    expect(at(TASK_OFFSETS.result_hash)).toBe("bb".repeat(32));
    expect(b.readBigInt64LE(TASK_OFFSETS.finalized_at)).toBe(1_759_995_000n);
  });

  it("refuses bytes that are not a Task", () => {
    const { b } = handMade();
    expect(() => decodeTaskAccount(b.subarray(0, 100))).toThrow(/417 bytes/);
    b[0] = 0;
    expect(() => decodeTaskAccount(b)).toThrow(/not a ProofMarket Task/);
  });

  it("reads the settled Devnet account and its hashes are the ones the API shows", () => {
    const t = decodeTaskAccount(bytes(settled));
    expect(t.status).toBe("SETTLED");
    expect(t.outcome).toBe("VERIFIED");
    expect(t.recipients).toHaveLength(1);
    expect(t.result_hash).toBe(settled.public_result.result_hash);
    expect(t.evidence_root).toBe(settled.public_result.evidence_root);
    expect(t.task_id_hash).toBe(`sha256:${Buffer.from(taskIdHash(settled.verification_id)).toString("hex")}`);
  });
});

describe("taskPda", () => {
  it("derives the address the settle job wrote (attestation.task_account)", () => {
    expect(taskPda(settled.verification_id).toBase58()).toBe(settled.task_account);
    expect(taskPda(refunded.verification_id).toBase58()).toBe(refunded.task_account);
  });
});

describe("compareWithAccount", () => {
  const account = decodeTaskAccount(bytes(settled));
  const { type: _t, answer_kind: _k, published: _p, ...rest } = settled.public_result;
  /** What GET /v1/verifications/{id} returns as `result` for this task: rejected_submissions and proof, no type. */
  const requesterResult = {
    ...rest,
    rejected_submissions: {},
    proof: { url: `https://proofmarket.fun/r/${settled.verification_id}` },
  };

  it("matches the production result, from the public body and from the requester's result", () => {
    for (const r of [settled.public_result, requesterResult]) {
      const out = compareWithAccount(settled.verification_id, r, settled.task_account, account);
      expect(out).toMatchObject({ matches: true, reason: null, outcome: "VERIFIED" });
      expect(out.computed_result_hash).toBe(out.result_hash);
      // The program's clock at finalize, a few seconds after the server's verified_at.
      expect(out.finalized_at).toBe("2026-10-04T05:02:41.000Z");
    }
  });

  it("does not match a changed answer, a different id, or a result with a rejection it does not show", () => {
    const answer = compareWithAccount(
      settled.verification_id,
      { ...requesterResult, answer: "sha256:00" },
      settled.task_account,
      account,
    );
    expect(answer).toMatchObject({ matches: false, reason: expect.stringMatching(/not the one recorded/) });
    const other = compareWithAccount("ver_other", requesterResult, settled.task_account, account);
    expect(other.matches).toBe(false);
    const hidden = compareWithAccount(
      settled.verification_id,
      { ...settled.public_result, answer: "sha256:00" },
      settled.task_account,
      account,
    );
    expect(hidden).toMatchObject({ matches: false, reason: expect.stringMatching(/requester's result/) });
  });

  it("a refunded task was never finalized: no hash on chain, no match", () => {
    const t = decodeTaskAccount(bytes(refunded));
    expect(t.status).toBe("REFUNDED");
    expect(t.result_hash).toBeNull();
    const out = compareWithAccount(
      refunded.verification_id,
      refunded.public_result,
      refunded.task_account,
      t,
    );
    expect(out).toMatchObject({
      matches: false,
      finalized_at: null,
      reason: expect.stringMatching(/never finalized/),
    });
  });

  it("no account: no match", () => {
    expect(compareWithAccount("ver_x", {}, "x", null).matches).toBe(false);
  });

  it("the hash it recomputes is core's resultHash over the hashed fields", () => {
    const out = compareWithAccount(settled.verification_id, requesterResult, settled.task_account, account);
    const {
      proof: _pr,
      consensus_ratio: _c,
      result_hash: _h,
      attestation: _a,
      settlement: _s,
      verified_at: _v,
      ...input
    } = requesterResult as Record<string, unknown>;
    expect(out.computed_result_hash).toBe(`sha256:${Buffer.from(resultHash(input)).toString("hex")}`);
  });
});

describe.skipIf(process.env.PM_DEVNET !== "1")("verifyOnChain on Devnet", () => {
  it("matches the production result", async () => {
    const out = await verifyOnChain({
      verificationId: settled.verification_id,
      result: settled.public_result,
      rpcUrl: process.env.SOLANA_RPC_URL ?? DEVNET_RPC_URL,
    });
    expect(out).toMatchObject({ matches: true, task_account: settled.task_account });
  });
});
