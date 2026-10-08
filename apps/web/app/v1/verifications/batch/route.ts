// POST /v1/verifications/batch — 05 §2.1a (01 §4.25). Auth: requester. Idempotency-Key required.
import { appContext } from "@/lib/context";
import { handleCreateBatch } from "@/lib/handlers/requester";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";

export const POST = route(async (req) => {
  const app = appContext();
  const res = await handleCreateBatch(app, req);
  if (res.status === 201) {
    const { verifications } = (await res.clone().json()) as { verifications: { verification_id: string }[] };
    kickAfter(
      app,
      verifications.map((v) => `FUND_TASK:${v.verification_id}`),
    );
  }
  return res;
});
