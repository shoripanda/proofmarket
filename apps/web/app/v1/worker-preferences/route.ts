// GET / POST /v1/worker-preferences — preferred and blocked workers (docs/architecture 14 §4). Auth: requester.
import { appContext } from "@/lib/context";
import { handleWorkerPreferences } from "@/lib/handlers/prefs";
import { route } from "@/lib/http";

const h = route(async (req) => handleWorkerPreferences(appContext(), req));
export const GET = h;
export const POST = h;
