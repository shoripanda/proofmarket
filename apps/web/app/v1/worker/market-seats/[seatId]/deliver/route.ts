// POST /v1/worker/market-seats/{seat_id}/deliver — hand in the work. Auth: worker.
import { appContext } from "@/lib/context";
import { handleWorkerDeliver } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ seatId: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleWorkerDeliver(appContext(), req, (await params).seatId),
);
