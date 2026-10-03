// GET /v1/verifications/{id}/evidence — 05 §2.5 (P1). Auth: requester. 5-minute signed URLs of derived images.
import { appContext } from "@/lib/context";
import { handleEvidenceUrls } from "@/lib/handlers/requester";
import { type IdParams, route } from "@/lib/http";

export const GET = route<IdParams>(async (req, { params }) =>
  handleEvidenceUrls(appContext(), req, (await params).id),
);
