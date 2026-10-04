// POST /v1/x402/verifications — 05 §2.9. Auth: an x402 payment (no API key). 01 §4.19.
import { appContext } from "@/lib/context";
import { handleX402Create } from "@/lib/handlers/x402";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";

// Settling waits for the payment to confirm on Solana before the verification is created.
export const maxDuration = 60;

export const POST = route(async (req) => {
  const app = appContext();
  const { res, created } = await handleX402Create(app, req);
  if (created) kickAfter(app, [`FUND_TASK:${created}`]);
  return res;
});
