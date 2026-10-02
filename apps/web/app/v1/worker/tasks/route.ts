// GET /v1/worker/tasks — 05 §3.2 (P0). Location arrives rounded; never stored or logged. Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleListTasks } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

export const GET = route(async (req) => handleListTasks(appContext(), req));
