// GET /v1/tasks/{id} — a task with its seats and deliveries. Auth: requester.
import { appContext } from "@/lib/context";
import { handleGetTask } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const GET = route<P>(async (req, { params }) => handleGetTask(appContext(), req, (await params).id));
