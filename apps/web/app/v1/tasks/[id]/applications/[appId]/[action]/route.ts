// POST /v1/tasks/{id}/applications/{app_id}/{accept|reject}. Auth: requester.
import { appContext } from "@/lib/context";
import { handleDecideApplication } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string; appId: string; action: string }> };
export const POST = route<P>(async (req, { params }) => {
  const p = await params;
  return handleDecideApplication(appContext(), req, p.id, p.appId, p.action);
});
