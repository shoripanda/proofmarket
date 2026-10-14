// 16 §6: deposits in any enabled asset, counted from parsed transactions.
import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { depositAccounts, solanaPayUrls, sumTransfers } from "../src/deposits.ts";

const operator = Keypair.generate().publicKey;
const USDC = Keypair.generate().publicKey.toBase58();
const PYUSD = Keypair.generate().publicKey.toBase58();
const to = depositAccounts(operator, [
  { symbol: "USDC", mint: USDC, tokenProgram: "spl-token", native: false },
  {
    symbol: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    tokenProgram: "spl-token",
    native: true,
  },
  { symbol: "PYUSD", mint: PYUSD, tokenProgram: "token-2022", native: false },
]);
const acct = (asset: string) => to.accounts.find((a) => a.asset === asset)?.account ?? "";

/** A parsed transaction with these instructions at the top level. */
function tx(instructions: { program: string; type: string; info: Record<string, unknown> }[]) {
  return {
    transaction: {
      message: {
        accountKeys: [],
        instructions: instructions.map((i) => ({
          program: i.program,
          programId: operator,
          parsed: { type: i.type, info: i.info },
        })),
      },
    },
    meta: { err: null, innerInstructions: [] },
  } as unknown as ParsedTransactionWithMeta;
}

describe("deposit accounts", () => {
  it("receive SOL in the wallet and each token in an ATA under its own token program", () => {
    expect(acct("SOL")).toBe(operator.toBase58());
    expect(acct("USDC")).not.toBe(acct("PYUSD"));
    // the same mint under the other program would be another address
    const other = depositAccounts(operator, [
      { symbol: "PYUSD", mint: PYUSD, tokenProgram: "spl-token", native: false },
    ]);
    expect(other.accounts[0]?.account).not.toBe(acct("PYUSD"));
  });

  it("give one Solana Pay link per asset", () => {
    const urls = solanaPayUrls(to, "Ref111");
    expect(urls.SOL).not.toContain("spl-token");
    expect(urls.PYUSD).toContain(`spl-token=${PYUSD}`);
  });
});

describe("sumTransfers", () => {
  it("counts every asset of one transaction separately", () => {
    const sums = sumTransfers(
      tx([
        { program: "system", type: "transfer", info: { destination: operator.toBase58(), lamports: 5_000 } },
        {
          program: "spl-token",
          type: "transferChecked",
          info: { destination: acct("USDC"), mint: USDC, tokenAmount: { amount: "700000" } },
        },
        {
          program: "spl-token-2022",
          type: "transferChecked",
          info: { destination: acct("PYUSD"), mint: PYUSD, tokenAmount: { amount: "250000" } },
        },
      ]),
      to,
    );
    expect(Object.fromEntries(sums)).toEqual({ SOL: 5_000n, USDC: 700_000n, PYUSD: 250_000n });
  });

  it("counts what arrives when a Token-2022 transfer carries a fee", () => {
    const sums = sumTransfers(
      tx([
        {
          program: "spl-token-2022",
          type: "transferCheckedWithFee",
          info: {
            destination: acct("PYUSD"),
            mint: PYUSD,
            tokenAmount: { amount: "1000000" },
            feeAmount: { amount: "1000" },
          },
        },
      ]),
      to,
    );
    expect(sums.get("PYUSD")).toBe(999_000n);
  });

  it("ignores transfers to other accounts and a checked transfer naming another mint", () => {
    const sums = sumTransfers(
      tx([
        { program: "spl-token", type: "transfer", info: { destination: "Elsewhere", amount: "5" } },
        {
          program: "spl-token",
          type: "transferChecked",
          info: { destination: acct("USDC"), mint: PYUSD, tokenAmount: { amount: "9" } },
        },
        { program: "system", type: "transfer", info: { destination: "Elsewhere", lamports: 1 } },
      ]),
      to,
    );
    expect(sums.size).toBe(0);
  });
});
