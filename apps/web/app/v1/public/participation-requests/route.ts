// POST /v1/public/participation-requests — sign-ups from /join (05 §1, 04 §3.20). No auth; 5 per minute per IP.
import { appContext } from "@/lib/context";
import { readJson, route } from "@/lib/http";
import { clientIp } from "@/lib/services/oauth-service";
import { createParticipationRequest } from "@/lib/services/participation-service";

export const POST = route(async (req) =>
  Response.json(await createParticipationRequest(appContext(), await readJson(req), clientIp(req)), {
    status: 201,
  }),
);
