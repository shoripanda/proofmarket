// POST /v1/console/worker-preferences — prefer, block or clear a worker from the console. Auth: console cookie.
import { appContext } from "@/lib/context";
import { handleConsoleWorkerPreference } from "@/lib/handlers/console";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleConsoleWorkerPreference(appContext(), req));
