// POST /v1/admin/flags — 08 §6 (P0). Kill switches. Auth: operator.
import { appContext } from "@/lib/context";
import { env } from "@/lib/env";
import { handleSetFlag } from "@/lib/handlers/operator";
import { route } from "@/lib/http";

const secrets = () => ({ adminToken: env().ADMIN_TOKEN, cronSecret: env().INTERNAL_CRON_SECRET });
export const POST = route(async (req) => handleSetFlag(appContext(), secrets(), req));
