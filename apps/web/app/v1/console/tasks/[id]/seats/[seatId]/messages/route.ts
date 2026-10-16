// POST /v1/console/tasks/{id}/seats/{seat_id}/messages — reply from the console. Auth: console cookie.
import { appContext } from "@/lib/context";
import { handleConsoleSeatMessage } from "@/lib/handlers/console";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string; seatId: string }> };
export const POST = route<P>(async (req, { params }) => {
  const p = await params;
  return handleConsoleSeatMessage(appContext(), req, p.id, p.seatId);
});
