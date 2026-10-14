// Self-service deposits (15 §4.3): a reference per requester, tick credits finalized transfers once each.

import { schema } from "@proofmarket/db";
import bs58 from "bs58";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleConsoleDeposit, handleConsoleLogin } from "../lib/handlers/console";
import { issueApiKey } from "../lib/services/admin-service";
import { consoleAuth, dashboard } from "../lib/services/console-service";
import { runDeposits } from "../lib/services/deposit-service";
import { tick } from "../lib/services/jobs";
import { call, createTestApp } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});
const post = (path: string, cookie?: string) =>
  new Request(`http://localhost:3917${path}`, {
    method: "POST",
    headers: {
      host: "localhost:3917",
      origin: "http://localhost:3917",
      ...(cookie ? { cookie } : {}),
    },
  });
async function login() {
  const res = await call(
    (r) => handleConsoleLogin(t.app, r),
    new Request("http://localhost:3917/v1/console/session", {
      method: "POST",
      headers: {
        host: "localhost:3917",
        origin: "http://localhost:3917",
        "content-type": "application/json",
      },
      body: JSON.stringify({ api_key: t.apiKey }),
    }),
  );
  const cookie = res.headers.get("set-cookie") ?? "";
  const token = /pm_console=([^;]+)/.exec(cookie)?.[1] ?? "";
  const auth = await consoleAuth(t.app, token);
  if (!auth) throw new Error("no auth");
  return { cookie: `pm_console=${token}`, auth };
}

describe("deposits", () => {
  it("issues one 32-byte reference per requester and shows the addresses and Solana Pay links", async () => {
    const { cookie, auth } = await login();
    const before = await dashboard(t.app, auth);
    expect(before.deposit.reference).toBeNull();
    expect(before.deposit.addresses).toBeNull();

    const r1 = await call((r) => handleConsoleDeposit(t.app, r), post("/v1/console/deposit", cookie));
    expect(r1.status).toBe(200);
    const { reference } = (await r1.json()) as { reference: string };
    expect(bs58.decode(reference)).toHaveLength(32);
    const r2 = await call((r) => handleConsoleDeposit(t.app, r), post("/v1/console/deposit", cookie));
    expect(((await r2.json()) as { reference: string }).reference).toBe(reference);

    const d = await dashboard(t.app, auth);
    expect(d.deposit.reference).toBe(reference);
    expect(d.deposit.addresses?.wallet).toBe("FakeOperatorWallet");
    expect(d.deposit.solana_pay?.USDC).toBe(
      `solana:FakeOperatorWallet?spl-token=TestUsdcMint&reference=${reference}&label=ProofMarket`,
    );
    expect(d.deposit.solana_pay?.SOL).toBe(
      `solana:FakeOperatorWallet?reference=${reference}&label=ProofMarket`,
    );

    // Without a session the endpoint refuses.
    const r3 = await call((r) => handleConsoleDeposit(t.app, r), post("/v1/console/deposit"));
    expect(r3.status).toBe(401);
  });

  it("credits each finalized transfer once, in the right asset, and resumes from the last signature", async () => {
    const { cookie, auth } = await login();
    const r = await call((r) => handleConsoleDeposit(t.app, r), post("/v1/console/deposit", cookie));
    const { reference } = (await r.json()) as { reference: string };
    t.chain.deposits.set(reference, [
      { signature: "sigA", slot: 10, blockTime: null, asset: "USDC", amount: 5_000_000n, from: "Payer1" },
      { signature: "sigB", slot: 11, blockTime: null, asset: "SOL", amount: 250_000_000n, from: "Payer1" },
      // Dust below 0.000001 SOL is dropped, not credited.
      { signature: "sigC", slot: 12, blockTime: null, asset: "SOL", amount: 500n, from: "Payer1" },
    ]);
    expect(await runDeposits(t.app)).toBe(2);
    let d = await dashboard(t.app, auth);
    expect(Object.fromEntries(d.balances.map((b) => [b.asset, b.amount]))).toMatchObject({
      USDC: "15",
      SOL: "0.25",
    });
    expect(d.deposit.deposits.map((x) => [x.signature, x.asset, x.amount])).toEqual([
      ["sigB", "SOL", "0.25"],
      ["sigA", "USDC", "5"],
    ]);

    // A second pass finds nothing new: the poll resumes from sigB and sigA/sigB are keyed by signature.
    expect(await runDeposits(t.app)).toBe(0);
    expect(t.chain.depositCalls.at(-1)?.until).toBe("sigB");
    d = await dashboard(t.app, auth);
    expect(Object.fromEntries(d.balances.map((b) => [b.asset, b.amount]))).toMatchObject({
      USDC: "15",
      SOL: "0.25",
    });

    // The RPC repeating an old signature (e.g. `until` pruned) is still counted once.
    t.chain.deposits.set(reference, [
      { signature: "sigB", slot: 11, blockTime: null, asset: "SOL", amount: 250_000_000n, from: "Payer1" },
      { signature: "sigD", slot: 13, blockTime: null, asset: "USDC", amount: 1_500_000n, from: "Payer2" },
    ]);
    const res = await tick(t.app);
    expect(res.failed).toEqual([]);
    d = await dashboard(t.app, auth);
    expect(Object.fromEntries(d.balances.map((b) => [b.asset, b.amount]))).toMatchObject({
      USDC: "16.5",
      SOL: "0.25",
    });
  });

  it("a failing lookup for one requester does not stop the others", async () => {
    const { cookie } = await login();
    const r = await call((r) => handleConsoleDeposit(t.app, r), post("/v1/console/deposit", cookie));
    const { reference } = (await r.json()) as { reference: string };
    // A second requester whose reference the RPC cannot answer for; it was never checked, so it polls first.
    const other = await issueApiKey(t.db, {
      principalId: t.principalId,
      requesterName: "other",
      maxTaskAmount: "5",
      dailySpendLimit: "20",
      operator: "test",
    });
    await t.db
      .update(schema.requesterCredentials)
      .set({ depositReference: "OtherReference" })
      .where(eq(schema.requesterCredentials.id, other.credentialId));
    t.chain.findDeposits = async (ref: string) => {
      if (ref === reference)
        return [{ signature: "sigZ", slot: 1, blockTime: null, asset: "USDC", amount: 1n, from: null }];
      throw new Error("rpc down");
    };
    expect(await runDeposits(t.app)).toBe(1);
  });
});
