// Devnet (or localnet) setup for the ProofMarket program (06 §7 steps 5-6, §6).
//   run devnet-setup.ts --url <rpc> [--own-mint] [--mint <pubkey>] [--allow-localnet] [--fund-treasury 100]
// Keys live in ~/.config/proofmarket/{admin,operator,verifier}.json (created if missing, mode 0600).
// Writes ~/.config/proofmarket/env.<cluster> with the server env values (contains secrets; never commit).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { configPda } from "@proofmarket/solana";
import idl from "@proofmarket/solana/idl" with { type: "json" };
import {
  createAssociatedTokenAccountIdempotent,
  createMint,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { Proofmarket } from "../packages/solana/idl/proofmarket.ts";
import { args, need } from "./lib.ts";

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const CIRCLE_DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const DIR = join(homedir(), ".config", "proofmarket");

function loadOrCreate(name: string): Keypair {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const p = join(DIR, `${name}.json`);
  if (existsSync(p))
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]));
  const kp = Keypair.generate();
  writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  chmodSync(p, 0o600);
  console.error(`created ${p}`);
  return kp;
}

const a = args();
const url = need(a, "url");
const conn = new Connection(url, "confirmed");
const genesis = await conn.getGenesisHash();
const cluster = genesis === DEVNET_GENESIS ? "devnet" : "localnet";
if (cluster !== "devnet" && a["allow-localnet"] !== "true") {
  console.error(
    `genesis ${genesis} is not Devnet; pass --allow-localnet for a local validator. Mainnet is never allowed.`,
  );
  process.exit(2);
}

const admin = loadOrCreate("admin");
const operator = loadOrCreate("operator");
const verifier = loadOrCreate("verifier");
for (const [n, k] of [
  ["admin", admin],
  ["operator", operator],
] as const) {
  const bal = await conn.getBalance(k.publicKey);
  console.error(`${n} ${k.publicKey.toBase58()} balance ${bal / LAMPORTS_PER_SOL} SOL`);
  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    try {
      const sig = await conn.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      console.error(`  airdropped 2 SOL to ${n}`);
    } catch (e) {
      console.error(
        `  airdrop failed (${String(e).slice(0, 120)}). Use https://faucet.solana.com for ${k.publicKey.toBase58()}`,
      );
    }
  }
}

let mint: PublicKey;
if (a["own-mint"] === "true") {
  mint = await createMint(conn, admin, admin.publicKey, null, 6);
  console.error(`created test mint ${mint.toBase58()} (6 decimals). Results will carry test_asset: true.`);
} else {
  mint = new PublicKey(a.mint ?? CIRCLE_DEVNET_USDC);
}
const treasury = await createAssociatedTokenAccountIdempotent(conn, admin, mint, operator.publicKey);
if (a["own-mint"] === "true" && a["fund-treasury"]) {
  await mintTo(conn, admin, mint, treasury, admin, BigInt(Math.round(Number(a["fund-treasury"]) * 1e6)));
  console.error(`minted ${a["fund-treasury"]} test tokens to treasury`);
}

const provider = new AnchorProvider(conn, new Wallet(admin), { commitment: "confirmed" });
const program = new Program<Proofmarket>(idl as Proofmarket, provider);
const programId = program.programId;
const [config] = configPda(programId);
const existing = await program.account.config.fetchNullable(config);
if (!existing) {
  const sig = await program.methods
    .initializeConfig({
      operator: operator.publicKey,
      verifier: verifier.publicKey,
      maxWitnesses: Number(a["max-witnesses"] ?? 5),
    })
    .accountsPartial({ admin: admin.publicKey, config, bountyMint: mint, treasury })
    .rpc();
  console.error(`initialize_config: ${sig}`);
}
const c = await program.account.config.fetch(config);
// Front-running guard (06 §3): anyone can call initialize_config first after deploy. Verify it is ours.
if (
  !c.admin.equals(admin.publicKey) ||
  !c.operator.equals(operator.publicKey) ||
  !c.verifier.equals(verifier.publicKey)
) {
  console.error(
    "CONFIG IS NOT OURS (initialize_config was front-run or keys changed). Redeploy under a new program id.",
  );
  process.exit(3);
}
if (!c.bountyMint.equals(mint))
  console.error(`note: config.bounty_mint is ${c.bountyMint.toBase58()} (use update_config to switch)`);

const envFile = join(DIR, `env.${cluster}`);
writeFileSync(
  envFile,
  [
    `PROGRAM_ID=${programId.toBase58()}`,
    `BOUNTY_MINT=${c.bountyMint.toBase58()}`,
    `SOLANA_EXPECTED_GENESIS_HASH=${genesis}`,
    `OPERATOR_SECRET_KEY=${bs58.encode(operator.secretKey)}`,
    `VERIFIER_SECRET_KEY=${bs58.encode(verifier.secretKey)}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      cluster,
      program_id: programId.toBase58(),
      config: config.toBase58(),
      bounty_mint: c.bountyMint.toBase58(),
      treasury: getAssociatedTokenAddressSync(c.bountyMint, operator.publicKey).toBase58(),
      operator: operator.publicKey.toBase58(),
      verifier: verifier.publicKey.toBase58(),
      env_file: envFile,
    },
    null,
    2,
  ),
);
process.exit(0);
