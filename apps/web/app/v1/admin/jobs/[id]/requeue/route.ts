// POST /v1/admin/jobs/{id}/requeue — 08 §6 (P0). Auth: operator.
import { appContext } from "@/lib/context";
import { env } from "@/lib/env";
import { handleRequeue } from "@/lib/handlers/operator";
import { route } from "@/lib/http";

const secrets = () => ({ adminToken: env().ADMIN_TOKEN, cronSecret: env().INTERNAL_CRON_SECRET });
type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleRequeue(appContext(), secrets(), req, (await params).id),
);
