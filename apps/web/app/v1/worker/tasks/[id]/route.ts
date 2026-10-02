// GET /v1/worker/tasks/{id} — 05 §3 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleTaskDetail } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const GET = route<P>(async (req, { params }) =>
  handleTaskDetail(appContext(), req, (await params).id),
);
