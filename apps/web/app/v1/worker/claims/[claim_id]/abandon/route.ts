// POST /v1/worker/claims/{claim_id}/abandon — 05 §3.7 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleAbandon } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

type P = { params: Promise<{ claim_id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleAbandon(appContext(), req, (await params).claim_id),
);
