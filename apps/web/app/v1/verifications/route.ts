// POST /v1/verifications — 05 §2.1 (P0). Auth: requester. Idempotency-Key required.
import { appContext } from "@/lib/context";
import { handleCreate } from "@/lib/handlers/requester";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleCreate(appContext(), req));
