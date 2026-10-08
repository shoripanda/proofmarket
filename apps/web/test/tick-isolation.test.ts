// The tick's steps are isolated: a step that throws is reported in `failed`, and the steps after it — above all
// the job drain that funds and settles tasks — still run (2026-10-08 incident: a broken query in the optimistic
// step held every settlement for hours).
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCreate } from "../lib/handlers/requester";
import { tick } from "../lib/services/jobs";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

vi.mock("../lib/services/challenge-service", () => ({
  runOptimistic: async () => {
    throw new Error("boom: simulated broken query");
  },
}));

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

describe("tick step isolation", () => {
  it("a failing step is reported and the jobs still drain", async () => {
    const res = await call(
      (r) => handleCreate(t.app, r),
      jsonReq("POST", "/v1/verifications", {
        key: t.apiKey,
        body: createBody(t.principalId),
        idem: crypto.randomUUID(),
      }),
    );
    const { verification_id: id } = (await res.json()) as { verification_id: string };

    const r = await tick(t.app);
    expect(r.failed).toEqual(["optimistic"]);
    expect(r.jobsRun).toBeGreaterThanOrEqual(1);
    const [task] = await t.db
      .select({ status: schema.verificationRequests.status })
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, id));
    // FUND_TASK ran despite the failure before it (fake chain in tests)
    expect(task?.status).toBe("OPEN");
  });
});
