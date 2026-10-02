// POST /v1/verifications/{id}/cancel — 05 §2.3 (P0). Auth: requester. T14/T15; repeated calls return the same state.
import { appContext } from "@/lib/context";
import { handleCancel } from "@/lib/handlers/requester";
import { type IdParams, route } from "@/lib/http";

export const POST = route<IdParams>(async (req, { params }) =>
  handleCancel(appContext(), req, (await params).id),
);
