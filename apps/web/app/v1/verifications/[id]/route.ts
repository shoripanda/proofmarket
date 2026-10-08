// GET /v1/verifications/{id} — 05 §2.2 (P0). Auth: requester. Owner credential only; others get 404.
import { appContext } from "@/lib/context";
import { handleGet } from "@/lib/handlers/requester";
import { type IdParams, route } from "@/lib/http";

// ?wait= long-polls (01 §4.27); keep the function alive for it.
export const maxDuration = 60;

export const GET = route<IdParams>(async (req, { params }) =>
  handleGet(appContext(), req, (await params).id),
);
