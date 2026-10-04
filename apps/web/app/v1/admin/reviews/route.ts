// GET /v1/admin/reviews — submissions waiting for the outside AI review (01 §4.17). Auth: operator.
import { appContext } from "@/lib/context";
import { env } from "@/lib/env";
import { handleListReviews } from "@/lib/handlers/operator";
import { route } from "@/lib/http";

const secrets = () => ({ adminToken: env().ADMIN_TOKEN, cronSecret: env().INTERNAL_CRON_SECRET });
export const GET = route(async (req) => handleListReviews(appContext(), secrets(), req));
