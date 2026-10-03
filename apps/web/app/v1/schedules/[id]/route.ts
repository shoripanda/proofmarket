// DELETE /v1/schedules/{id} — stop a recurring check (05 §1, 04 §3.23). Auth: requester.
import { appContext } from "@/lib/context";
import { handleStopSchedule } from "@/lib/handlers/requester";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const DELETE = route<P>(async (req, { params }) =>
  handleStopSchedule(appContext(), req, (await params).id),
);
