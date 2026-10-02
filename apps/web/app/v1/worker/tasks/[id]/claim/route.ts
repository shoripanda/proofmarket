// POST /v1/worker/tasks/{id}/claim — 05 §3.3 (P0). Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleClaim } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) => handleClaim(appContext(), req, (await params).id));
