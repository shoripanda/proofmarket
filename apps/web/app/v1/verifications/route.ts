// POST /v1/verifications — 05 §2.1 (P0). Auth: requester. Idempotency-Key required.
import { appContext } from "@/lib/context";
import { handleCreate } from "@/lib/handlers/requester";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";

export const POST = route(async (req) => {
  const app = appContext();
  const res = await handleCreate(app, req);
  if (res.status === 201) {
    const { verification_id } = (await res.clone().json()) as { verification_id: string };
    kickAfter(app, [`FUND_TASK:${verification_id}`]);
  }
  return res;
});
