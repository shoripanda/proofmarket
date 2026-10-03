// POST /v1/public/removal-requests — photo removal requests from /rules (05 §1, 04 §3.21). No auth; 5/min per IP.
import { appContext } from "@/lib/context";
import { readJson, route } from "@/lib/http";
import { clientIp } from "@/lib/services/oauth-service";
import { createRemovalRequest } from "@/lib/services/removal-service";

export const POST = route(async (req) =>
  Response.json(await createRemovalRequest(appContext(), await readJson(req), clientIp(req)), {
    status: 201,
  }),
);
