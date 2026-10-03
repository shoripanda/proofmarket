import "server-only";
import { type BBox, parseBBox } from "@proofmarket/core";
import { createDb, type Db } from "@proofmarket/db";
import { createSettlementAdapter, type SettlementAdapter } from "@proofmarket/solana";
import bs58 from "bs58";
import { createPrivyIdentity } from "./adapters/privy";
import { createSupabaseStorage } from "./adapters/supabase-storage";
import { env } from "./env";
import type { EvidenceStorage, IdentityProvider } from "./ports";

/** Everything a service needs, injected so integration tests can use PGlite and fakes. */
export interface AppContext {
  db: Db;
  now: () => Date;
  config: AppConfig;
  identity: IdentityProvider;
  storage: EvidenceStorage;
  /** Lazy: only chain jobs need it, and it validates the RPC/config on first use (06 §5.2). */
  settlement: () => SettlementAdapter;
}

export interface AppConfig {
  appEnv: "local" | "preview" | "demo" | "test";
  pilotBBox: BBox;
  maxWitnesses: number;
  locationEncKey: Buffer; // 32 bytes
  workerRefSalt: string;
}

let ctx: AppContext | undefined;

/** Production context from env (lazy, once per server instance). */
export function appContext(): AppContext {
  if (!ctx) {
    const e = env();
    ctx = {
      db: createDb(e.DATABASE_URL),
      now: () => new Date(),
      identity: createPrivyIdentity({
        appId: e.NEXT_PUBLIC_PRIVY_APP_ID,
        appSecret: e.PRIVY_APP_SECRET,
        ...(e.PRIVY_VERIFICATION_KEY ? { verificationKey: e.PRIVY_VERIFICATION_KEY } : {}),
      }),
      storage: createSupabaseStorage({ url: e.SUPABASE_URL, serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY }),
      settlement: once(() =>
        createSettlementAdapter({
          rpcUrl: e.SOLANA_RPC_URL,
          expectedGenesisHash: e.SOLANA_EXPECTED_GENESIS_HASH,
          programId: e.PROGRAM_ID,
          bountyMint: e.BOUNTY_MINT,
          operatorSecretKey: bs58.decode(e.OPERATOR_SECRET_KEY),
          verifierSecretKey: bs58.decode(e.VERIFIER_SECRET_KEY),
        }),
      ),
      config: {
        appEnv: e.APP_ENV,
        pilotBBox: parseBBox(e.PILOT_BBOX),
        maxWitnesses: e.MAX_WITNESSES,
        locationEncKey: Buffer.from(e.LOCATION_ENC_KEY, "base64"),
        workerRefSalt: e.WORKER_REF_SALT,
      },
    };
  }
  return ctx;
}

function once<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
}
