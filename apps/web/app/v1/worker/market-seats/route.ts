// GET /v1/worker/market-seats — the worker's seats. Auth: worker.
import { appContext } from "@/lib/context";
import { handleWorkerListSeats } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

export const GET = route(async (req) => handleWorkerListSeats(appContext(), req));
