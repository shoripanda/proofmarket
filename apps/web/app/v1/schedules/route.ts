// POST / GET /v1/schedules — recurring checks (05 §1, 04 §3.23). Auth: requester.
import { appContext } from "@/lib/context";
import { handleCreateSchedule, handleListSchedules } from "@/lib/handlers/requester";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleCreateSchedule(appContext(), req));
export const GET = route(async (req) => handleListSchedules(appContext(), req));
