// S-07: the browser-side comparison of a public result with the on-chain Task account.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compare, decodeTask } from "../lib/client/onchain-check";

const PROGRAM = "A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s";
const ID = "ver_01M40AGJHTP0J0K7XDH18WH6H0";
const root = "ab".repeat(32);
const res = "cd".repeat(32);

function account(o: { outcome?: number; idHash?: Buffer } = {}) {
  const d = Buffer.alloc(8 + 400);
  (o.idHash ?? createHash("sha256").update(`proofmarket:task:v1:${ID}`).digest()).copy(d, 11);
  d[157] = 1; // Finalized
  d[158] = o.outcome ?? 1; // Verified
  Buffer.from(root, "hex").copy(d, 160);
  Buffer.from(res, "hex").copy(d, 192);
  return new Uint8Array(d);
}
const shown = {
  verificationId: ID,
  status: "VERIFIED",
  evidenceRoot: `sha256:${root}`,
  resultHash: `sha256:${res}`,
};

describe("on-chain check", () => {
  it("decodes the Task fields at the program's offsets", () => {
    expect(decodeTask(account())).toMatchObject({
      status: "Finalized",
      outcome: "Verified",
      evidenceRoot: root,
    });
  });

  it("all items pass for a matching account", async () => {
    const items = await compare(shown, { owner: PROGRAM, data: account() }, PROGRAM);
    expect(items.every((i) => i.ok)).toBe(true);
  });

  it("flags a wrong owner, another task's account, a different outcome or hash", async () => {
    const fail = async (acc: { owner: string; data: Uint8Array }, s = shown) =>
      (await compare(s, acc, PROGRAM)).filter((i) => !i.ok).map((i) => i.label);
    expect(await fail({ owner: "11111111111111111111111111111111", data: account() })).toHaveLength(1);
    expect(await fail({ owner: PROGRAM, data: account({ idHash: Buffer.alloc(32, 1) }) })).toHaveLength(1);
    expect(await fail({ owner: PROGRAM, data: account({ outcome: 2 }) })).toHaveLength(1);
    expect(
      await fail({ owner: PROGRAM, data: account() }, { ...shown, resultHash: "sha256:00" }),
    ).toHaveLength(1);
  });
});
