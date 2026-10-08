// 13 §2: GET /v1/public/verifications/{id}/onchain, and verifyOnChain's recompute against what the server hashed.
import { PublicOnchainSchema } from "@proofmarket/core/schemas/api";
import {
  compareWithAccount,
  PROOFMARKET_PROGRAM_ID,
  type TaskAccount,
  taskPda,
} from "@proofmarket/sdk/onchain";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate, handleGet, handlePublicOnchain, handlePublicResult } from "../lib/handlers/requester";
import { tick } from "../lib/services/jobs";
import { publicOnchain } from "../lib/services/public-service";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
});

const create = async () => {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId),
      idem: crypto.randomUUID(),
    }),
  );
  return ((await res.json()) as { verification_id: string }).verification_id;
};
// biome-ignore lint/suspicious/noExplicitAny: test convenience
const json = async (p: Promise<Response>): Promise<any> => (await p).json();

/** A Task account holding what the settle job sent, as decodeTaskAccount would return it. */
const accountFor = (o: { result_hash: string; evidence_root: string }): TaskAccount => ({
  version: 1,
  task_id_hash: "",
  requester: "",
  requester_ref_hash: "",
  mint: "",
  amount_per_witness: 500_000n,
  required_witnesses: 1,
  quorum: 1,
  deadline: 0,
  status: "SETTLED",
  outcome: "VERIFIED",
  refund_reason: "NONE",
  evidence_root: o.evidence_root,
  result_hash: o.result_hash,
  recipients: [],
  paid_total: 500_000n,
  created_at: 1,
  finalized_at: 2,
  closed_at: 0,
});

describe("on-chain facts", () => {
  it("404 without a result; not recorded before settle; the hashes and PDA once settled", async () => {
    const id = await create();
    await expect(publicOnchain(t.app, id)).rejects.toMatchObject({ code: "VERIFICATION_NOT_FOUND" });
    await tick(t.app); // fund
    await witness(t, alice, id);

    const before = await publicOnchain(t.app, id);
    expect(before).toMatchObject({ recorded: false, result_hash: null, outcome: null, finalized_at: null });
    expect(before.task_account).toBe(taskPda(id, PROOFMARKET_PROGRAM_ID).toBase58());

    await tick(t.app); // settle
    const res = await call(
      (r) => handlePublicOnchain(t.app, r, id),
      jsonReq("GET", `/v1/public/verifications/${id}/onchain`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    const body = PublicOnchainSchema.parse(await res.json());
    const pub = await json(handlePublicResult(t.app, new Request("http://x"), id));
    expect(body).toMatchObject({
      verification_id: id,
      program_id: PROOFMARKET_PROGRAM_ID,
      task_account: pub.attestation.task_account,
      recorded: true,
      outcome: "VERIFIED",
      result_hash: pub.result_hash,
      evidence_root: pub.evidence_root,
    });
    expect(body.explorer_url).toContain(`/address/${body.task_account}?cluster=devnet`);
    expect(body.how_to_read.typescript).toContain(id);
    expect(body.how_to_read.rust).toContain("try_deserialize");
  }, 30_000);

  it("unknown or malformed ids are 404", async () => {
    for (const id of ["nope", "ver_01M42M6WXZ93MFR3YDQZ7JXEHG"]) {
      const res = await call((r) => handlePublicOnchain(t.app, r, id), jsonReq("GET", "/x"));
      expect(res.status).toBe(404);
    }
  });

  it("the requester's result and the public result both recompute to the hash the server put on chain", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    await tick(t.app);
    const facts = await publicOnchain(t.app, id);
    const account = accountFor({
      result_hash: facts.result_hash ?? "",
      evidence_root: facts.evidence_root ?? "",
    });
    const mine = (await json(call((r) => handleGet(t.app, r, id), jsonReq("GET", "/x", { key: t.apiKey }))))
      .result;
    expect(mine.proof).toBeDefined(); // an extra field that is not hashed
    expect(compareWithAccount(id, mine, facts.task_account, account)).toMatchObject({ matches: true });
    const pub = await json(handlePublicResult(t.app, new Request("http://x"), id));
    expect(compareWithAccount(id, pub, facts.task_account, account)).toMatchObject({ matches: true });
    expect(compareWithAccount(id, { ...mine, answer: "CLOSED" }, facts.task_account, account).matches).toBe(
      false,
    );
  }, 30_000);
});
