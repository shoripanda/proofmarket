// Operator: send a little Devnet USDC from the treasury to the x402 sample agent's wallet (01 §4.19).
// The treasury is the operator's token account, the same one x402 payments flow back into.
//
//   pnpm --filter @proofmarket/scripts run run x402-fund-agent.ts [--amount 1] [--to <pubkey>] [--rpc <url>]
//
// Reads ~/.config/proofmarket/operator.json and BOUNTY_MINT from ~/.config/proofmarket/env.devnet.
// Without --to, funds ~/.config/proofmarket/x402-agent.json (created if missing). The operator pays the rent
// for the agent's token account, so the agent never needs SOL.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { args } from "./lib.ts";

const a = args();
const dir = join(homedir(), ".config", "proofmarket");
const readKey = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]));
const env = Object.fromEntries(
  readFileSync(join(dir, "env.devnet"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const mint = new PublicKey(env.BOUNTY_MINT ?? "");
const operator = readKey(join(dir, "operator.json"));

let to: PublicKey;
if (a.to) to = new PublicKey(a.to);
else {
  const p = join(dir, "x402-agent.json");
  if (!existsSync(p)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(p, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  to = readKey(p).publicKey;
}

const amount = BigInt(Math.round(Number(a.amount ?? "1") * 1e6));
const connection = new Connection(a.rpc ?? "https://api.devnet.solana.com", "confirmed");
const treasury = getAssociatedTokenAddressSync(mint, operator.publicKey);
const dest = getAssociatedTokenAddressSync(mint, to);
const tx = new Transaction().add(
  createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, dest, to, mint),
  createTransferCheckedInstruction(treasury, mint, dest, operator.publicKey, amount, 6),
);
const sig = await connection.sendTransaction(tx, [operator]);
await connection.confirmTransaction(sig, "confirmed");
console.log(
  `sent ${Number(amount) / 1e6} USDC to ${to.toBase58()}: https://explorer.solana.com/tx/${sig}?cluster=devnet`,
);
