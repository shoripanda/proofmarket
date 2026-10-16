// POST / GET /v1/webhooks — the API key's own webhook endpoints (docs/architecture 12 §5.1). Auth: requester.
import { appContext } from "@/lib/context";
import { handleCreateWebhook, handleListWebhooks } from "@/lib/handlers/webhooks";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleCreateWebhook(appContext(), req));
export const GET = route(async (req) => handleListWebhooks(appContext(), req));
