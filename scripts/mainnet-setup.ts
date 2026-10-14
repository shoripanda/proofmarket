// Mainnet setup for the ProofMarket program (12 §10.2, 15 §4.4). Runs only against mainnet-beta, only with the
// owner's decision document named, and never airdrops or mints anything.
//   run mainnet-setup.ts --url <paid rpc> --decision-doc docs/legal/2026-10-13-owner-decision.md
//                        [--admin-keypair <path>] [--max-witnesses 5] [--allow-wsol]
//                        [--assets SOL,USDT,PYUSD]   (16 §3: add_mint and an operator account per registry token;
//                                                     Token-2022 ones need program v1.3. Run check-assets.ts first.)
// Keys: ~/.config/proofmarket/mainnet/{admin,operator,verifier}.json. admin may instead be a hardware wallet
// (then export its keypair file for this one run, or pass --admin-keypair). operator and verifier are created
// if missing (mode 0600) and must differ from the Devnet keys (the server refuses them otherwise, 15 §4.1).
// Writes ~/.config/proofmarket/env.mainnet-beta with the server env values (contains secrets; never commit).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { assetInfo } from "@proofmarket/core";
import { allowedMintPda, configPda } from "@proofmarket/solana";
import idl from "@proofmarket/solana/idl" with { type: "json" };
import {
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { Proofmarket } from "../packages/solana/idl/proofmarket.ts";
import { args, need } from "./lib.ts";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// The Devnet admin / operator / verifier (lib/cluster.ts DEVNET_KEYS). Mainnet must not reuse them (08 §2).
const DEVNET_KEYS = new Set([
  "zWNUtDAHyhy1BQvZYNq6C9H5nLfKhWRbdDe8ZbwqcDJ",
  "5JCzti3UrorjeoabuB1QirdPtWLRwa7CK8oDSGx34kiN",
  "ETb2GXYYPpnbNjHaNfb84Ptx4UQNWdf9txnNCq2s5ycr",
]);
const DIR = join(homedir(), ".config", "proofmarket", "mainnet");

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

function loadOrCreate(name: string): Keypair {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const p = join(DIR, `${name}.json`);
  if (existsSync(p)) return loadKeypair(p);
  const kp = Keypair.generate();
  writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  chmodSync(p, 0o600);
  console.error(`created ${p}`);
  return kp;
}

const a = args();
const url = need(a, "url");
const decisionDoc = resolve(need(a, "decision-doc"));
if (!existsSync(decisionDoc)) {
  console.error(
    `--decision-doc ${decisionDoc} does not exist. Write the owner's decision down first (12 §10.1).`,
  );
  process.exit(2);
}
if (/api\.mainnet-beta\.solana\.com/.test(url)) {
  console.error("the public mainnet RPC is rate limited; use the paid RPC the server will use (15 §6)");
  process.exit(2);
}
const conn = new Connection(url, "confirmed");
const genesis = await conn.getGenesisHash();
if (genesis !== MAINNET_GENESIS) {
  console.error(
    `genesis ${genesis} is not mainnet-beta. This script is for mainnet only; Devnet uses devnet-setup.ts.`,
  );
  process.exit(2);
}

const admin = a["admin-keypair"] ? loadKeypair(a["admin-keypair"]) : loadOrCreate("admin");
const operator = loadOrCreate("operator");
const verifier = loadOrCreate("verifier");
for (const [n, k] of [
  ["admin", admin],
  ["operator", operator],
  ["verifier", verifier],
] as const) {
  const pk = k.publicKey.toBase58();
  if (DEVNET_KEYS.has(pk)) {
    console.error(`${n} ${pk} is a Devnet key. Mainnet needs its own keys (15 §4.1).`);
    process.exit(2);
  }
}
if (operator.publicKey.equals(verifier.publicKey)) {
  console.error("operator and verifier must differ (06 §2.1)");
  process.exit(2);
}
for (const [n, k, min] of [
  ["admin", admin, 0.5],
  ["operator", operator, 0.2],
] as const) {
  const bal = (await conn.getBalance(k.publicKey)) / LAMPORTS_PER_SOL;
  console.error(`${n} ${k.publicKey.toBase58()} balance ${bal} SOL`);
  if (bal < min) {
    console.error(
      `  ${n} needs at least ${min} SOL for this run (12 §10.1). No airdrops on mainnet: send SOL and rerun.`,
    );
    process.exit(2);
  }
}

const mint = new PublicKey(MAINNET_USDC);
const treasury = await createAssociatedTokenAccountIdempotent(conn, admin, mint, operator.publicKey);
console.error(`treasury (operator's USDC account) ${treasury.toBase58()}`);

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
if (!c.bountyMint.equals(mint)) {
  console.error(
    `config.bounty_mint is ${c.bountyMint.toBase58()}, not mainnet USDC. Fix with update_config before going live.`,
  );
  process.exit(3);
}

if (a["allow-wsol"] === "true") {
  const [allowed] = allowedMintPda(programId, NATIVE_MINT);
  if (await conn.getAccountInfo(allowed)) {
    console.error(`wSOL already allowed (${allowed.toBase58()})`);
  } else {
    const sig = await program.methods
      .addMint()
      .accountsPartial({ admin: admin.publicKey, config, mint: NATIVE_MINT, allowedMint: allowed })
      .rpc();
    console.error(`add_mint wSOL: ${sig}`);
  }
}

// 16 §3: every other token the server will accept. Idempotent: an allowed mint or an existing account is kept.
const enabled = ["USDC"];
for (const symbol of String(a.assets ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean)) {
  const info = assetInfo(symbol);
  if (!info?.mainnetMint) {
    console.error(`--assets: ${symbol} is not in the asset registry`);
    process.exit(2);
  }
  if (symbol === "USDC") continue;
  const m = new PublicKey(info.mainnetMint);
  const tokenProgram = info.tokenProgram === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const [allowed] = allowedMintPda(programId, m);
  if (await conn.getAccountInfo(allowed)) console.error(`${symbol} already allowed (${allowed.toBase58()})`);
  else {
    const sig = await program.methods
      .addMint()
      .accountsPartial({ admin: admin.publicKey, config, mint: m, allowedMint: allowed })
      .rpc();
    console.error(`add_mint ${symbol}: ${sig}`);
  }
  // The operator's account receives deposits and funds tasks; SOL arrives in the wallet itself.
  if (!info.native) {
    const ata = await createAssociatedTokenAccountIdempotent(
      conn,
      admin,
      m,
      operator.publicKey,
      { commitment: "confirmed" },
      tokenProgram,
    );
    console.error(`${symbol} operator account ${ata.toBase58()}`);
  }
  enabled.push(symbol);
}

const envFile = join(homedir(), ".config", "proofmarket", "env.mainnet-beta");
writeFileSync(
  envFile,
  [
    "SOLANA_CLUSTER=mainnet-beta",
    `SOLANA_RPC_URL=${url}`,
    `SOLANA_EXPECTED_GENESIS_HASH=${genesis}`,
    `PROGRAM_ID=${programId.toBase58()}`,
    `BOUNTY_MINT=${c.bountyMint.toBase58()}`,
    `OPERATOR_SECRET_KEY=${bs58.encode(operator.secretKey)}`,
    `VERIFIER_SECRET_KEY=${bs58.encode(verifier.secretKey)}`,
    "REAL_FUNDS_ENABLED=true",
    `ASSETS_ENABLED=${enabled.join(",")}`,
    `LEGAL_SIGNOFF=${decisionDoc}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      cluster: "mainnet-beta",
      program_id: programId.toBase58(),
      config: config.toBase58(),
      bounty_mint: c.bountyMint.toBase58(),
      treasury: getAssociatedTokenAddressSync(c.bountyMint, operator.publicKey).toBase58(),
      admin: admin.publicKey.toBase58(),
      operator: operator.publicKey.toBase58(),
      verifier: verifier.publicKey.toBase58(),
      env_file: envFile,
    },
    null,
    2,
  ),
);
