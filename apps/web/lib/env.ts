import "server-only";
import { z } from "zod";

// 02 §6.2. Parsed once at startup; a missing or malformed variable fails fast.
const EnvSchema = z.object({
  APP_ENV: z.enum(["local", "preview", "demo"]),
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
  PILOT_BBOX: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/),
  MAX_WITNESSES: z.coerce.number().int().min(1).max(5),
  ANTHROPIC_API_KEY: z.string().optional(),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;
export function env(): Env {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
