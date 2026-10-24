// GET /v1/public/market-tasks — open general tasks anyone can see (docs/architecture 14 §6). No auth.
import { appContext } from "@/lib/context";
import { handlePublicMarketTasks } from "@/lib/handlers/public-market";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => handlePublicMarketTasks(appContext(), req));
