// GET /v1/worker/me — 05 §3 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleMe } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

export const GET = route(async (req) => handleMe(appContext(), req));
