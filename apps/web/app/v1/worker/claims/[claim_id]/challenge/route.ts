// POST /v1/worker/claims/{claim_id}/challenge — 05 §3.4 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleChallenge } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

type P = { params: Promise<{ claim_id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleChallenge(appContext(), req, (await params).claim_id),
);
