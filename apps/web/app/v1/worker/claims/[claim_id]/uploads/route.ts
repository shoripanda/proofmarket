// POST /v1/worker/claims/{claim_id}/uploads — 05 §3.5 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleUpload } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

type P = { params: Promise<{ claim_id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleUpload(appContext(), req, (await params).claim_id),
);
