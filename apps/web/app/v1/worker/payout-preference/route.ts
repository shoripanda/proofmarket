// PUT /v1/worker/payout-preference — interest in yen payouts (01 §4.10). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleYenInterest } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

export const PUT = route(async (req) => handleYenInterest(appContext(), req));
