// POST /v1/worker/tasks/{id}/evidence — 05 §3.6 (P0). Idempotency-Key required. Auth: worker (Privy).
import { appContext } from "@/lib/context";
import { handleEvidence } from "@/lib/handlers/worker";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) => handleEvidence(appContext(), req, (await params).id));
