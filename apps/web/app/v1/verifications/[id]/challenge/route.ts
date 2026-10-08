// POST /v1/verifications/{id}/challenge — 13 §3. Auth: any requester key. Creates a recheck paid by the bond.
import { appContext } from "@/lib/context";
import { handleChallenge } from "@/lib/handlers/requester";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) => {
  const app = appContext();
  const res = await handleChallenge(app, req, (await params).id);
  if (res.status === 201) {
    const { recheck_verification_id } = (await res.clone().json()) as { recheck_verification_id: string };
    kickAfter(app, [`FUND_TASK:${recheck_verification_id}`]);
  }
  return res;
});
