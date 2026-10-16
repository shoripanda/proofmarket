// POST /v1/console/tasks/{id}/seats/{seat_id}/{release|request-changes|reject} — from the console. Auth: console cookie.
import { appContext } from "@/lib/context";
import { handleConsoleTaskSeat } from "@/lib/handlers/console";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string; seatId: string; action: string }> };
export const POST = route<P>(async (req, { params }) => {
  const p = await params;
  return handleConsoleTaskSeat(appContext(), req, p.id, p.seatId, p.action);
});
