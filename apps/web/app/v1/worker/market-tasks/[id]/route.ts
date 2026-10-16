// GET /v1/worker/market-tasks/{id}. Auth: worker.
import { appContext } from "@/lib/context";
import { handleWorkerGetMarketTask } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const GET = route<P>(async (req, { params }) =>
  handleWorkerGetMarketTask(appContext(), req, (await params).id),
);
