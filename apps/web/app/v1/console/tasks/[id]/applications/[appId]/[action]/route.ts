// POST /v1/console/tasks/{id}/applications/{app_id}/{accept|reject} — from the requester console. Auth: console cookie.
import { appContext } from "@/lib/context";
import { handleConsoleTaskApplication } from "@/lib/handlers/console";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string; appId: string; action: string }> };
export const POST = route<P>(async (req, { params }) => {
  const p = await params;
  return handleConsoleTaskApplication(appContext(), req, p.id, p.appId, p.action);
});
