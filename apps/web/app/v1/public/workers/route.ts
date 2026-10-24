// GET /v1/public/workers — opt-in public worker profiles (docs/architecture 14 §3.4). No auth.
import { appContext } from "@/lib/context";
import { handlePublicWorkers } from "@/lib/handlers/profiles";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => handlePublicWorkers(appContext(), req));
