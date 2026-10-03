// GET /v1/worker/payouts — 05 §3.7 (P1). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handlePayouts } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

export const GET = route(async (req) => handlePayouts(appContext(), req));
