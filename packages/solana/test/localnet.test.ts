// Real adapter against a local validator (09 §3.3: I-FLOW chain half, I-SET-02, D9/D10 through the adapter).
// Runs only when ~/.config/proofmarket/env.localnet exists and PM_LOCALNET=1:
//   solana-test-validator --bpf-program <PROGRAM_ID> target/deploy/proofmarket.so --limit-ledger-size 50000000
//   pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url http://127.0.0.1:8899 --allow-localnet --own-mint --fund-treasury 100
//   PM_LOCALNET=1 pnpm --filter @proofmarket/solana exec vitest run
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { createAnchorAdapter } from "../src/anchor-adapter.ts";

const ENV = join(homedir(), ".config", "proofmarket", "env.localnet");
const enabled = process.env.PM_LOCALNET === "1" && existsSync(ENV);
const env = enabled
  ? Object.fromEntries(
      readFileSync(ENV, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split("=") as [string, string]),
    )
  : {};
const RPC = "http://127.0.0.1:8899";

describe.skipIf(!enabled)("anchor adapter on localnet", () => {
  const adapter = enabled
    ? createAnchorAdapter({
        rpcUrl: RPC,
        expectedGenesisHash: env.SOLANA_EXPECTED_GENESIS_HASH ?? "",
        programId: env.PROGRAM_ID ?? "",
        bountyMint: env.BOUNTY_MINT ?? "",
        operatorSecretKey: bs58.decode(env.OPERATOR_SECRET_KEY ?? ""),
        verifierSecretKey: bs58.decode(env.VERIFIER_SECRET_KEY ?? ""),
        confirmTimeoutMs: 60_000,
      })
    : (undefined as never);
  const conn = new Connection(RPC, "confirmed");
  const mint = new PublicKey(env.BOUNTY_MINT ?? "11111111111111111111111111111111");
  const signed: string[] = [];
  const onSigned = async (s: string) => {
    signed.push(s);
  };
  const fund = (h: Uint8Array) =>
    adapter.fundTask(
      {
        verificationId: "ver_x",
        taskIdHash: h,
        requesterRefHash: randomBytes(32),
        amountPerWitness: 500_000n,
        requiredWitnesses: 2,
        quorum: 2,
        deadline: new Date(Date.now() + 3_600_000),
      },
      onSigned,
    );
  const tokenBal = async (owner: PublicKey) =>
    BigInt(
      (await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, owner)).catch(() => null))?.value
        .amount ?? "0",
    );

  it("refuses a wrong genesis hash (REQ-X-P-105)", async () => {
    const bad = createAnchorAdapter({
      rpcUrl: RPC,
      expectedGenesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      programId: env.PROGRAM_ID ?? "",
      bountyMint: env.BOUNTY_MINT ?? "",
      operatorSecretKey: bs58.decode(env.OPERATOR_SECRET_KEY ?? ""),
      verifierSecretKey: bs58.decode(env.VERIFIER_SECRET_KEY ?? ""),
    });
    await expect(bad.assertSafeToStart()).rejects.toThrow(/refusing to start/);
    await adapter.assertSafeToStart();
  });

  it("fund -> finalize+settle (1 of 2 witnesses) -> idempotent re-run -> refund refused", async () => {
    const h = randomBytes(32);
    const treasuryBefore = (await adapter.balances()).treasuryAmount;
    const f = await fund(h);
    expect(f).toMatchObject({ kind: "confirmed", alreadyDone: false });
    expect(await fund(h)).toMatchObject({ kind: "confirmed", alreadyDone: true }); // I-IDEM-03 on chain
    expect((await adapter.readTask(h))?.status).toBe("Funded");

    const worker = Keypair.generate().publicKey; // fresh wallet: ATA must be created by the adapter
    const s = await adapter.finalizeAndSettle(
      {
        verificationId: "ver_x",
        taskIdHash: h,
        outcome: "EXPIRED",
        evidenceRoot: randomBytes(32),
        resultHash: randomBytes(32),
        recipients: [worker.toBase58()],
      },
      onSigned,
    );
    expect(s).toMatchObject({ kind: "confirmed", alreadyDone: false });
    const t = await adapter.readTask(h);
    expect(t).toMatchObject({
      status: "Settled",
      outcome: "InsufficientWitnesses",
      paidTotal: 500_000n,
      recipients: [worker.toBase58()],
    });
    expect(await tokenBal(worker)).toBe(500_000n);
    expect((await adapter.balances()).treasuryAmount).toBe(treasuryBefore - 500_000n); // remainder returned

    const again = await adapter.finalizeAndSettle(
      {
        verificationId: "ver_x",
        taskIdHash: h,
        outcome: "EXPIRED",
        evidenceRoot: randomBytes(32),
        resultHash: randomBytes(32),
        recipients: [worker.toBase58()],
      },
      onSigned,
    );
    expect(again).toMatchObject({ kind: "confirmed", alreadyDone: true }); // I-SET-02: no second payout
    expect(await tokenBal(worker)).toBe(500_000n);
    expect(
      await adapter.refund({ verificationId: "ver_x", taskIdHash: h, reason: "Cancelled" }, onSigned),
    ).toMatchObject({ kind: "halt" }); // D9
  });

  it("fund -> refund -> idempotent re-run -> settle refused", async () => {
    const h = randomBytes(32);
    const before = (await adapter.balances()).treasuryAmount;
    await fund(h);
    expect((await adapter.balances()).treasuryAmount).toBe(before - 1_000_000n);
    expect(
      await adapter.refund({ verificationId: "ver_y", taskIdHash: h, reason: "Cancelled" }, onSigned),
    ).toMatchObject({ kind: "confirmed", alreadyDone: false });
    expect((await adapter.balances()).treasuryAmount).toBe(before);
    expect(
      await adapter.refund({ verificationId: "ver_y", taskIdHash: h, reason: "Cancelled" }, onSigned),
    ).toMatchObject({ kind: "confirmed", alreadyDone: true });
    const settle = await adapter.finalizeAndSettle(
      {
        verificationId: "ver_y",
        taskIdHash: h,
        outcome: "VERIFIED",
        evidenceRoot: randomBytes(32),
        resultHash: randomBytes(32),
        recipients: [Keypair.generate().publicKey.toBase58()],
      },
      onSigned,
    );
    expect(settle).toMatchObject({ kind: "halt" }); // D10
    expect(signed.length).toBeGreaterThan(0);
  });
});
