// GET /v1/worker/market-tasks — open general tasks (docs/architecture 13 §8). Auth: worker.
import { appContext } from "@/lib/context";
import { handleWorkerListMarketTasks } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

export const GET = route(async (req) => handleWorkerListMarketTasks(appContext(), req));
