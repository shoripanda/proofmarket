// GET / PUT / DELETE /v1/worker/push-subscription — 05 §1, 04 §3.22 (P2). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handlePushDelete, handlePushSave, handlePushStatus } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

export const GET = route(async (req) => handlePushStatus(appContext(), req));
export const PUT = route(async (req) => handlePushSave(appContext(), req));
export const DELETE = route(async (req) => handlePushDelete(appContext(), req));
