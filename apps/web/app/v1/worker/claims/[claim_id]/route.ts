// GET /v1/worker/claims/{claim_id} — 05 §3.7 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleClaimDetail } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

type P = { params: Promise<{ claim_id: string }> };
export const GET = route<P>(async (req, { params }) =>
  handleClaimDetail(appContext(), req, (await params).claim_id),
);
