// POST /v1/tasks/{id}/seats/{seat_id}/{release|request-changes|reject}. Auth: requester.
import { appContext } from "@/lib/context";
import { handleDecideSeat } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string; seatId: string; action: string }> };
export const POST = route<P>(async (req, { params }) => {
  const p = await params;
  return handleDecideSeat(appContext(), req, p.id, p.seatId, p.action);
});
