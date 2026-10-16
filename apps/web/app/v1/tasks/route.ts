// POST / GET /v1/tasks — general tasks (docs/architecture 13 §7.1). Auth: requester.
import { appContext } from "@/lib/context";
import { handleCreateTask, handleListTasksOwn } from "@/lib/handlers/market-tasks";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleCreateTask(appContext(), req));
export const GET = route(async (req) => handleListTasksOwn(appContext(), req));
