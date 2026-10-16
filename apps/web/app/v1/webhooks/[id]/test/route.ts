// POST /v1/webhooks/{id}/test — send one signed webhook.test event now. Auth: requester.
import { appContext } from "@/lib/context";
import { handleTestWebhook } from "@/lib/handlers/webhooks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) =>
  handleTestWebhook(appContext(), req, (await params).id),
);
