// POST /v1/worker/market-tasks/{id}/apply — apply, or take a seat when the task is first come. Auth: worker.
import { appContext } from "@/lib/context";
import { handleWorkerApply } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleWorkerApply(appContext(), req, (await params).id),
);
