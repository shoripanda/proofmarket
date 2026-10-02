// POST /v1/verifications/{id}/cancel — 05 §2.3 (P0). Auth: requester. T14/T15; repeated calls return the same state.
import { appContext } from "@/lib/context";
import { handleCancel } from "@/lib/handlers/requester";
import { type IdParams, route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";

export const POST = route<IdParams>(async (req, { params }) => {
  const app = appContext();
  const { id } = await params;
  const res = await handleCancel(app, req, id);
  if (res.ok) kickAfter(app, [`REFUND_TASK:${id}`]);
  return res;
});
