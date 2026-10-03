// POST /v1/admin/verifications/{id}/evidence/revoke-access — 08 §6 (P0). Auth: operator.
import { appContext } from "@/lib/context";
import { env } from "@/lib/env";
import { handleRevokeEvidence } from "@/lib/handlers/operator";
import { route } from "@/lib/http";

const secrets = () => ({ adminToken: env().ADMIN_TOKEN, cronSecret: env().INTERNAL_CRON_SECRET });
type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleRevokeEvidence(appContext(), secrets(), req, (await params).id),
);
