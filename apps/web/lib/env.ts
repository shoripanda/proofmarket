import "server-only";
import { z } from "zod";

// 02 §6.2. Parsed once; a missing or malformed variable fails fast.
// DEV_MODE=1 (APP_ENV=local only) runs without Privy / Supabase / Solana — see lib/adapters/dev.ts.
const Common = {
  APP_ENV: z.enum(["local", "preview", "demo"]),
  DATABASE_URL: z.string().min(1),
  PILOT_BBOX: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/),
  MAX_WITNESSES: z.coerce.number().int().min(1).max(5),
  NEXT_PUBLIC_BASE_URL: z.url().optional(),
};

const FullSchema = z.object({
  ...Common,
  DEV_MODE: z.literal("0").optional(),
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  PRIVY_VERIFICATION_KEY: z.string().min(1).optional(),
  SOLANA_RPC_URL: z.url(),
  SOLANA_EXPECTED_GENESIS_HASH: z.string().min(32),
  PROGRAM_ID: z.string().min(32),
  BOUNTY_MINT: z.string().min(32),
  OPERATOR_SECRET_KEY: z.string().min(1),
  VERIFIER_SECRET_KEY: z.string().min(1),
  LOCATION_ENC_KEY: z.string().min(1),
  WORKER_REF_SALT: z.string().min(16),
  WEBHOOK_SIGNING_SECRET_PEPPER: z.string().min(16),
  INTERNAL_CRON_SECRET: z.string().min(32),
  ADMIN_TOKEN: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().optional(),
});

const DEV_SECRET = "dev-only-not-a-secret-dev-only-not-a-secret";
const DevSchema = z.object({
  ...Common,
  APP_ENV: z.literal("local"),
  DEV_MODE: z.literal("1"),
  LOCATION_ENC_KEY: z.string().default(Buffer.alloc(32, 7).toString("base64")),
  WORKER_REF_SALT: z.string().default(DEV_SECRET),
  INTERNAL_CRON_SECRET: z.string().default(DEV_SECRET),
  ADMIN_TOKEN: z.string().default(DEV_SECRET),
});

export type FullEnv = z.infer<typeof FullSchema>;
export type DevEnv = z.infer<typeof DevSchema>;
export type Env = (FullEnv & { DEV_MODE?: "0" }) | DevEnv;

let cached: Env | undefined;
export function env(): Env {
  cached ??= process.env.DEV_MODE === "1" ? DevSchema.parse(process.env) : FullSchema.parse(process.env);
  return cached;
}
export const isDev = (e: Env): e is DevEnv => e.DEV_MODE === "1";
