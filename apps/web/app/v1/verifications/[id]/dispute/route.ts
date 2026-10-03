// POST /v1/verifications/{id}/dispute — 01 §4.12 (P2). Auth: requester. Creates a recheck task.
import { appContext } from "@/lib/context";
import { handleDispute } from "@/lib/handlers/requester";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) => {
  const app = appContext();
  const res = await handleDispute(app, req, (await params).id);
  if (res.status === 201) {
    const { recheck_verification_id } = (await res.clone().json()) as { recheck_verification_id: string };
    kickAfter(app, [`FUND_TASK:${recheck_verification_id}`]);
  }
  return res;
});
