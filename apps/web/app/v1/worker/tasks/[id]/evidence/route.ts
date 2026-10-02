// POST /v1/worker/tasks/{id}/evidence — 05 §3.6 (P0). Idempotency-Key required. Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleEvidence } from "@/lib/handlers/worker";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) => {
  const app = appContext();
  const { id } = await params;
  const res = await handleEvidence(app, req, id);
  if (res.ok) kickAfter(app, [`FINALIZE_AND_SETTLE:${id}`]); // no-op unless the task just reached its outcome
  return res;
});
