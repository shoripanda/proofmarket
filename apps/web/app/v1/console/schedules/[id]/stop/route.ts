// POST /v1/console/schedules/{id}/stop — stop a recurring check from the console (01 §4.14).
import { appContext } from "@/lib/context";
import { handleConsoleStopSchedule } from "@/lib/handlers/console";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleConsoleStopSchedule(appContext(), req, (await params).id),
);
