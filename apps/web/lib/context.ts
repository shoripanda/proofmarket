import "server-only";
import { type BBox, parseBBox } from "@proofmarket/core";
import { createDb, type Db } from "@proofmarket/db";
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
