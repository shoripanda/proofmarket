// GET /v1/webhooks/deliveries — every attempt to the key's endpoints, newest first. Auth: requester.
import { appContext } from "@/lib/context";
import { handleListDeliveries } from "@/lib/handlers/webhooks";
import { route } from "@/lib/http";

export const GET = route(async (req) => handleListDeliveries(appContext(), req));
