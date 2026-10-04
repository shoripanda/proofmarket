// POST /v1/admin/reviews/{submission_id} — record the outside reviewer's verdict (01 §4.17). Auth: operator.
import { appContext } from "@/lib/context";
import { env } from "@/lib/env";
import { handleApplyReview } from "@/lib/handlers/operator";
import { route } from "@/lib/http";

const secrets = () => ({ adminToken: env().ADMIN_TOKEN, cronSecret: env().INTERNAL_CRON_SECRET });
type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleApplyReview(appContext(), secrets(), req, (await params).id),
);
