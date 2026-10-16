// POST /v1/tasks/{id}/cancel — stop new applicants; unfilled seats go back to the balance. Auth: requester.
import { appContext } from "@/lib/context";
import { handleCancelTask } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleCancelTask(appContext(), req, (await params).id),
);
