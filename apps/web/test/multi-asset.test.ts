// Rewards in any enabled registry token (16 §3-6): enabled per server, decimals per token, a balance per token,
// the token's own mint on chain, deposits per token, and the public list. The test app enables USDC, SOL, BONK
// (5 decimals) and PYUSD (Token-2022) on test mints.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { authenticateApiKey } from "../lib/auth/requester";
import { handleCreate } from "../lib/handlers/requester";
import { topUp } from "../lib/services/admin-service";
import { dashboard } from "../lib/services/console-service";
import { ensureDepositReference, runDeposits } from "../lib/services/deposit-service";
import { publicAssets } from "../lib/services/public-service";
import { runFundTask } from "../lib/services/settlement-jobs";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp(); // 10 USDC
});
const body = (asset: string, amount: string, extra: Record<string, unknown> = {}) =>
  createBody(t.principalId, { bounty: { asset, amount, network: "solana-devnet", ...extra } });
const create = (b: unknown) =>
  call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", { key: t.apiKey, body: b, idem: crypto.randomUUID() }),
  );
// biome-ignore lint/suspicious/noExplicitAny: test convenience
const json = async (res: Response): Promise<any> => res.json();

describe("requests in other tokens", () => {
  it("refuse a registry token this server has not enabled", async () => {
    const res = await create(body("USDT", "1"));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("UNSUPPORTED_ASSET");
  });

  it("refuse a symbol outside the registry at validation", async () => {
    expect((await create(body("DOGE", "1"))).status).toBe(400);
  });

  it("refuse more fraction digits than the token has (BONK: 5)", async () => {
    await topUp(t.db, t.credentialId, "100000", "BONK");
    const res = await create(body("BONK", "1.000001"));
    expect(await json(res)).toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        details: { field: "bounty.amount", reason: "too_many_decimals", max_decimals: 5 },
      },
    });
    expect((await create(body("BONK", "1500.12345"))).status).toBe(201);
  });

  it("draw on that token's balance only, and escrow it in its own mint and base units", async () => {
    expect((await json(await create(body("BONK", "1500")))).error.code).toBe("INSUFFICIENT_BALANCE");
    await topUp(t.db, t.credentialId, "2000", "BONK");
    const { verification_id } = await json(await create(body("BONK", "1500.5")));
    expect(await runFundTask(t.app, verification_id, 1)).toMatchObject({ kind: "done" });
    const [task] = await t.db
      .select()
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, verification_id));
    expect(task?.bountyAsset).toBe("BONK");
    const onChain = await t.chain.readTask(task?.taskIdHash ?? new Uint8Array());
    // 1500.5 BONK at 5 decimals
    expect(onChain).toMatchObject({ mint: "TestBonkMint", amountPerWitness: 150_050_000n });
    const d = await dashboard(t.app, await authenticateApiKey(t.app, t.apiKey));
    expect(d.balances.find((b) => b.asset === "BONK")).toEqual({
      asset: "BONK",
      amount: "499.5",
      volatile: true,
    });
    expect(d.balances.find((b) => b.asset === "USDC")?.amount).toBe("10");
  });

  it("fund a Token-2022 reward (PYUSD) on its mint", async () => {
    await topUp(t.db, t.credentialId, "5", "PYUSD");
    const { verification_id } = await json(await create(body("PYUSD", "0.25")));
    await runFundTask(t.app, verification_id, 1);
    const [task] = await t.db
      .select()
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, verification_id));
    expect(await t.chain.readTask(task?.taskIdHash ?? new Uint8Array())).toMatchObject({
      mint: "TestPyusdMint",
      amountPerWitness: 250_000n,
    });
  });
});

describe("deposits in several tokens", () => {
  it("credit each token of one transaction to its own balance", async () => {
    const auth = await authenticateApiKey(t.app, t.apiKey);
    const ref = await ensureDepositReference(t.app, auth);
    t.chain.deposits.set(ref, [
      { signature: "sigMulti", slot: 10, blockTime: null, asset: "SOL", amount: 2_000_000n, from: "Payer" },
      { signature: "sigMulti", slot: 10, blockTime: null, asset: "BONK", amount: 12_345n, from: "Payer" },
    ]);
    expect(await runDeposits(t.app)).toBe(2);
    expect(await runDeposits(t.app)).toBe(0);
    const d = await dashboard(t.app, auth);
    expect(d.balances.find((b) => b.asset === "SOL")?.amount).toBe("0.002");
    expect(d.balances.find((b) => b.asset === "BONK")?.amount).toBe("0.12345");
    expect(d.deposit.solana_pay?.BONK).toContain("spl-token=TestBonkMint");
  });
});

describe("GET /v1/public/assets", () => {
  it("lists what is enabled, in registry order, with amount decimals", () => {
    const r = publicAssets(t.app);
    expect(r.network).toBe("solana-devnet");
    expect(r.assets.map((a) => a.symbol)).toEqual(["USDC", "SOL", "PYUSD", "BONK"]);
    expect(r.assets.find((a) => a.symbol === "BONK")).toMatchObject({
      decimals: 5,
      amount_decimals: 5,
      volatile: true,
      x402: false,
    });
    expect(r.assets.find((a) => a.symbol === "PYUSD")).toMatchObject({
      token_program: "token-2022",
      volatile: false,
    });
    expect(r.assets.find((a) => a.symbol === "USDC")?.x402).toBe(true);
  });
});
