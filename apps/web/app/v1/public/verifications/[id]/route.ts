// GET /v1/public/verifications/{id} — 05 §4 (P1). No auth. Public-safe result only.
import { appContext } from "@/lib/context";
import { handlePublicResult } from "@/lib/handlers/requester";
import { type IdParams, route } from "@/lib/http";

export const GET = route<IdParams>(async (req, { params }) =>
  handlePublicResult(appContext(), req, (await params).id),
);
