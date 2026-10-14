// Devnet (or localnet) setup for the ProofMarket program (06 §7 steps 5-6, §6).
//   run devnet-setup.ts --url <rpc> [--own-mint] [--mint <pubkey>] [--allow-localnet] [--fund-treasury 100]
//                       [--allow-wsol]   (program v1.2: allow tasks in wSOL = rewards in SOL, 15 §3.1)
//                       [--test-mints]   (program v1.3: an SPL Token mint standing in for USDT and a Token-2022
//                                         mint with PYUSD's extensions, both allowed and funded, 16 §3.3)
// Keys live in ~/.config/proofmarket/{admin,operator,verifier}.json (created if missing, mode 0600).
// Writes ~/.config/proofmarket/env.<cluster> with the server env values (contains secrets; never commit).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { allowedMintPda, configPda } from "@proofmarket/solana";
import idl from "@proofmarket/solana/idl" with { type: "json" };
import {
  createAssociatedTokenAccountIdempotent,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  createMint,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  mintTo,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
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

// 15 §3.1: allow wSOL once (add_mint fails if it is already allowed, so check first).
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

// 16 §3.3: two test mints so Devnet and localnet exercise both token programs. New ones on every run.
const testMints: Record<string, string> = {};
if (a["test-mints"] === "true") {
  const units = BigInt(Math.round(Number(a["fund-treasury"] ?? 100) * 1e6));
  const allow = async (m: PublicKey, tokenProgram: PublicKey, symbol: string) => {
    const ata = await createAssociatedTokenAccountIdempotent(
      conn,
      admin,
      m,
      operator.publicKey,
      { commitment: "confirmed" },
      tokenProgram,
    );
    await mintTo(conn, admin, m, ata, admin, units, [], { commitment: "confirmed" }, tokenProgram);
    const sig = await program.methods
      .addMint()
      .accountsPartial({
        admin: admin.publicKey,
        config,
        mint: m,
        allowedMint: allowedMintPda(programId, m)[0],
      })
      .rpc();
    console.error(`${symbol} test mint ${m.toBase58()} allowed (${sig}); treasury ${ata.toBase58()} funded`);
    testMints[symbol] = m.toBase58();
  };
  const usdt = await createMint(conn, admin, admin.publicKey, null, 6, undefined, {
    commitment: "confirmed",
  });
  await allow(usdt, TOKEN_PROGRAM_ID, "USDT");
  // PYUSD on mainnet (2026-10-14): permanent delegate, a zero transfer fee, an empty hook, a metadata pointer
  const kp = Keypair.generate();
  const exts = [
    ExtensionType.PermanentDelegate,
    ExtensionType.TransferFeeConfig,
    ExtensionType.TransferHook,
    ExtensionType.MetadataPointer,
  ];
  const space = getMintLen(exts);
  const p22 = TOKEN_2022_PROGRAM_ID;
  await sendAndConfirmTransaction(
    conn,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: kp.publicKey,
        space,
        lamports: await conn.getMinimumBalanceForRentExemption(space),
        programId: p22,
      }),
      createInitializePermanentDelegateInstruction(kp.publicKey, admin.publicKey, p22),
      createInitializeTransferFeeConfigInstruction(
        kp.publicKey,
        admin.publicKey,
        admin.publicKey,
        0,
        0n,
        p22,
      ),
      createInitializeTransferHookInstruction(kp.publicKey, admin.publicKey, PublicKey.default, p22),
      createInitializeMetadataPointerInstruction(kp.publicKey, admin.publicKey, null, p22),
      createInitializeMintInstruction(kp.publicKey, 6, admin.publicKey, null, p22),
    ),
    [admin, kp],
    { commitment: "confirmed" },
  );
  await allow(kp.publicKey, p22, "PYUSD");
}

const envFile = join(DIR, `env.${cluster}`);
writeFileSync(
  envFile,
  [
    `PROGRAM_ID=${programId.toBase58()}`,
    `BOUNTY_MINT=${c.bountyMint.toBase58()}`,
    `SOLANA_EXPECTED_GENESIS_HASH=${genesis}`,
    `OPERATOR_SECRET_KEY=${bs58.encode(operator.secretKey)}`,
    `VERIFIER_SECRET_KEY=${bs58.encode(verifier.secretKey)}`,
    ...Object.entries(testMints).map(([sym, m]) => `ASSET_MINT_${sym}=${m}`),
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
