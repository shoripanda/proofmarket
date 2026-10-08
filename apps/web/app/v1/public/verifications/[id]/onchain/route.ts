// GET /v1/public/verifications/{id}/onchain — 13 §2. No auth. The Task account and how a program reads it.
import { appContext } from "@/lib/context";
import { handlePublicOnchain } from "@/lib/handlers/requester";
import { type IdParams, route } from "@/lib/http";

export const GET = route<IdParams>(async (req, { params }) =>
  handlePublicOnchain(appContext(), req, (await params).id),
);
