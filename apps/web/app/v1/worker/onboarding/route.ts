// POST /v1/worker/onboarding — 05 §3.1 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleOnboarding } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleOnboarding(appContext(), req));
