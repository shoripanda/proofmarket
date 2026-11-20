// Balances belong to one network (migration 0040, 15 §4.5): after the switch to mainnet, Devnet trial and test
// balances must not spend, and a mainnet request must be accepted by the database.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { authenticateApiKey } from "../lib/auth/requester";
import { handleCreate } from "../lib/handlers/requester";
import { topUp } from "../lib/services/admin-service";
import { dashboard } from "../lib/services/console-service";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp(); // 10 USDC on Devnet
});
const create = (network: "solana" | "solana-devnet") =>
  call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, { bounty: { asset: "USDC", amount: "1", network } }),
      idem: crypto.randomUUID(),
    }),
  );
const code = async (res: Response) => ((await res.json()) as { error?: { code: string } }).error?.code;

describe("ledger network", () => {
  it("Devnet balance does not pay a mainnet request; mainnet money does, and the reserve is tagged", async () => {
    t.app.config.cluster = "mainnet-beta";
    expect(await code(await create("solana"))).toBe("INSUFFICIENT_BALANCE");

    await topUp(t.db, t.credentialId, "3", "solana");
    const res = await create("solana");
    expect(res.status).toBe(201);
    const { verification_id } = (await res.json()) as { verification_id: string };
    const [reserve] = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.verificationId, verification_id));
    expect(reserve?.network).toBe("solana");
    const [row] = await t.db
      .select({ n: schema.verificationRequests.bountyNetwork })
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, verification_id));
    expect(row?.n).toBe("solana");
  });

  it("the console shows only this cluster's balance", async () => {
    const auth = await authenticateApiKey(t.app, t.apiKey);
    if (!auth) throw new Error("no auth");
    expect((await dashboard(t.app, auth)).balance).toBe("10");
    t.app.config.cluster = "mainnet-beta";
    expect((await dashboard(t.app, auth)).balance).toBe("0");
  });
});
