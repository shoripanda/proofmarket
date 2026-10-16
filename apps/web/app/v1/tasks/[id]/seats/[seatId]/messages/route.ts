// GET / POST /v1/tasks/{id}/seats/{seat_id}/messages — the seat's conversation. Auth: requester.
import { appContext } from "@/lib/context";
import { handleSeatMessages } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string; seatId: string }> };
const h = route<P>(async (req, { params }) => {
  const p = await params;
  return handleSeatMessages(appContext(), req, p.id, p.seatId);
});
export const GET = h;
export const POST = h;
