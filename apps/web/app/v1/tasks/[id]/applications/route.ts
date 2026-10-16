// GET /v1/tasks/{id}/applications — who applied. Auth: requester.
import { appContext } from "@/lib/context";
import { handleListApplications } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const GET = route<P>(async (req, { params }) =>
  handleListApplications(appContext(), req, (await params).id),
);
