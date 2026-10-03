// POST /api/internal/tick — 02 §4.1 (P0). Called every minute by Supabase pg_cron + pg_net. Auth: cron secret.
import { appContext } from "@/lib/context";
import { env } from "@/lib/env";
import { handleTick } from "@/lib/handlers/operator";
import { route } from "@/lib/http";

const secrets = () => ({ adminToken: env().ADMIN_TOKEN, cronSecret: env().INTERNAL_CRON_SECRET });
export const POST = route(async (req) => handleTick(appContext(), secrets(), req));

export const maxDuration = 300;
