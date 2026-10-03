import "server-only";
import { join } from "node:path";
import { type BBox, parseBBox } from "@proofmarket/core";
import { createDb, type Db } from "@proofmarket/db";
import { openPgliteDb } from "@proofmarket/db/testing";
import { createSettlementAdapter, type SettlementAdapter } from "@proofmarket/solana";
import bs58 from "bs58";
import { assertDevAllowed, devChain, devIdentity, localStorage } from "./adapters/dev";
import { createPrivyIdentity } from "./adapters/privy";
import { createSupabaseStorage } from "./adapters/supabase-storage";
import { env, isDev } from "./env";
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

export const DEV_DATA_DIR = join(process.cwd(), ".data");

// One context per process. Next.js bundles route handlers and pages separately, so a module-level singleton
// would be duplicated (two PGlite instances on one directory in DEV_MODE, two pg pools in production).
const G = globalThis as typeof globalThis & { __pmAppContext?: AppContext };

/** Production (or DEV_MODE) context from env, created once per server process. */
export function appContext(): AppContext {
  G.__pmAppContext ??= buildContext();
  return G.__pmAppContext;
}

function buildContext(): AppContext {
  let ctx: AppContext;
  const e = env();
  const config: AppConfig = {
    appEnv: e.APP_ENV,
    pilotBBox: parseBBox(e.PILOT_BBOX),
    maxWitnesses: e.MAX_WITNESSES,
    locationEncKey: Buffer.from(e.LOCATION_ENC_KEY, "base64"),
    workerRefSalt: e.WORKER_REF_SALT,
  };
  if (isDev(e)) {
    assertDevAllowed(e.APP_ENV);
    const chain = devChain();
    ctx = {
      db: openPgliteDb(e.DATABASE_URL.replace(/^pglite:/, "")),
      now: () => new Date(),
      config,
      identity: devIdentity,
      storage: localStorage(join(DEV_DATA_DIR, "storage"), e.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"),
      settlement: () => chain,
    };
    return ctx;
  }
  ctx = {
    db: createDb(e.DATABASE_URL),
    now: () => new Date(),
    config,
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
  };
  return ctx;
}

function once<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
}
