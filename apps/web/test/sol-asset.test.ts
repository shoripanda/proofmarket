// Rewards in SOL (15 §3): behind SOL_ENABLED, a balance of their own, USDC-only x402, no funding before v1.2.
import { toBaseUnits } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { authenticateApiKey } from "../lib/auth/requester";
import { handleCreate } from "../lib/handlers/requester";
import { topUp } from "../lib/services/admin-service";
import { dashboard } from "../lib/services/console-service";
import { runFundTask } from "../lib/services/settlement-jobs";
import { parseX402Body } from "../lib/services/x402-service";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp(); // 10 USDC, no SOL
});
const sol = (amount = "0.01") =>
  createBody(t.principalId, { bounty: { asset: "SOL", amount, network: "solana-devnet" } });
const create = (body: unknown) =>
  call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", { key: t.apiKey, body, idem: crypto.randomUUID() }),
  );
const code = async (res: Response) => ((await res.json()) as { error?: { code: string } }).error?.code;

describe("SOL rewards", () => {
  it("are refused while SOL_ENABLED is off", async () => {
    t.app.config.solEnabled = false;
    await topUp(t.db, t.credentialId, "1", "SOL");
    const res = await create(sol());
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("UNSUPPORTED_ASSET");
  });

  it("draw on the SOL balance only: 10 USDC does not pay a SOL reward", async () => {
    expect(await code(await create(sol()))).toBe("INSUFFICIENT_BALANCE");
    await topUp(t.db, t.credentialId, "0.5", "SOL");
    const res = await create(sol("0.02"));
    expect(res.status).toBe(201);
    const { verification_id } = (await res.json()) as { verification_id: string };
    const [reserve] = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.verificationId, verification_id));
    expect(reserve).toMatchObject({ entryType: "RESERVE", asset: "SOL" });
    const d = await dashboard(t.app, await authenticateApiKey(t.app, t.apiKey));
    expect(d.balances).toEqual({ USDC: "10", SOL: "0.48" });
    expect(d).toMatchObject({ balance: "10", spent_today: "0" });
  });

  it("have a floor of 0.001 SOL", async () => {
    await topUp(t.db, t.credentialId, "1", "SOL");
    expect(await code(await create(sol("0.0009")))).toBe("VALIDATION_FAILED");
    expect((await create(sol("0.001"))).status).toBe(201);
  });

  it("are not funded on chain until program v1.2 (the job fails instead of escrowing USDC)", async () => {
    await topUp(t.db, t.credentialId, "1", "SOL");
    const { verification_id } = (await (await create(sol())).json()) as { verification_id: string };
    await expect(runFundTask(t.app, verification_id, 1)).rejects.toThrow(/program v1\.2/);
  });

  it("x402 stays USDC", () => {
    const { principal_ref: _p, ...body } = sol();
    expect(() => parseX402Body(body)).toThrow(expect.objectContaining({ code: "UNSUPPORTED_ASSET" }));
  });
});

describe("toBaseUnits", () => {
  it("keeps USDC micro units and turns SOL micro units into lamports", () => {
    expect(toBaseUnits(500_000n, "USDC")).toBe(500_000n);
    expect(toBaseUnits(1_000n, "SOL")).toBe(1_000_000n); // 0.001 SOL
  });
});
