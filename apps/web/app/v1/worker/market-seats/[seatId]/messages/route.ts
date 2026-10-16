// GET / POST /v1/worker/market-seats/{seat_id}/messages — the seat's conversation. Auth: worker.
import { appContext } from "@/lib/context";
import { handleWorkerSeatMessages } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ seatId: string }> };
const h = route<P>(async (req, { params }) =>
  handleWorkerSeatMessages(appContext(), req, (await params).seatId),
);
export const GET = h;
export const POST = h;
