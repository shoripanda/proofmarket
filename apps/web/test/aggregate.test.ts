// 13 §4 — sense index: three witnesses answer a form with scale and number fields; the result carries the
// median, min and max per field, and result_hash covers it.
import { RESULT_HASH_EXCLUDED_FIELDS, resultHash, toSha256Hex } from "@proofmarket/core";
import { beforeEach, describe, expect, it } from "vitest";
import { handleGet } from "../lib/handlers/requester";
import { publicResult } from "../lib/services/public-service";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

const FORM = {
  type: "form",
  fields: [
    { type: "scale", key: "noise", label: "Noise", max: 5, labels: ["quiet", "loud"] },
    { type: "scale", key: "clean", label: "Clean", max: 10, labels: ["dirty", "spotless"] },
    { type: "number", key: "seats", label: "Free seats", min: 0 },
    { type: "text", key: "note", label: "Note", required: false },
  ],
};

const getResult = async (id: string) =>
  (
    (await (
      await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
    ).json()) as { result: Record<string, unknown> | null }
  ).result;

async function formTask(witnesses: number) {
  return openTask(t, {
    type: "SITE_REPORT",
    question: "How does the cafe feel right now?",
    answer_schema: FORM,
    // high is 3 witnesses (quorum 2); the task still waits for all three before the result is saved
    assurance: witnesses === 3 ? { level: "high" } : { required_witnesses: witnesses, quorum: witnesses },
  });
}

describe("sense index (13 §4)", () => {
  it("returns median (lower middle on even counts), min, max and n per number and scale field", async () => {
    const id = await formTask(3);
    const answers = [
      { noise: 4, clean: 7, seats: 2 },
      { noise: 2, clean: 9, seats: 0, note: "busy" },
      { noise: 5, clean: 8, seats: 6 },
    ];
    for (const [i, a] of answers.entries()) {
      const { token } = await onboardWorker(t, `w${i}`);
      const { body } = await witness(t, token, id, { answer: JSON.stringify(a) });
      expect(body.state).toBe("VALID");
    }
    const result = await getResult(id);
    expect(result?.status).toBe("VERIFIED");
    expect(result?.aggregate).toEqual({
      noise: { median: 4, min: 2, max: 5, n: 3 },
      clean: { median: 8, min: 7, max: 9, n: 3 },
      seats: { median: 2, min: 0, max: 6, n: 3 },
    });
    // part of result_hash: recomputing it from the returned fields matches
    const input = Object.fromEntries(
      Object.entries(result ?? {}).filter(
        ([k]) => !(RESULT_HASH_EXCLUDED_FIELDS as readonly string[]).includes(k) && k !== "proof",
      ),
    );
    expect(toSha256Hex(resultHash(input))).toBe(result?.result_hash);
    // the numbers come from text answers, which the public result leaves out
    expect(await publicResult(t.app, id)).not.toHaveProperty("aggregate");
  });

  it("takes the lower middle value for an even count and stays absent below 3 answers", async () => {
    const id = await formTask(4);
    for (const [i, noise] of [1, 2, 4, 5].entries()) {
      const { token } = await onboardWorker(t, `e${i}`);
      await witness(t, token, id, { answer: JSON.stringify({ noise, clean: 5, seats: i }) });
    }
    const result = await getResult(id);
    expect(result?.aggregate).toHaveProperty("noise", {
      median: 2,
      min: 1,
      max: 5,
      n: 4,
    });

    const two = await formTask(2);
    for (const i of [0, 1]) {
      const { token } = await onboardWorker(t, `p${i}`);
      await witness(t, token, two, { answer: JSON.stringify({ noise: 3, clean: 3, seats: 1 }) });
    }
    const small = await getResult(two);
    expect(small?.status).toBe("VERIFIED");
    expect(small).not.toHaveProperty("aggregate");
  });
});
