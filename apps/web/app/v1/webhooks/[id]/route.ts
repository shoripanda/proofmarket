// DELETE /v1/webhooks/{id} — stop delivering to an endpoint. Auth: requester.
import { appContext } from "@/lib/context";
import { handleDeleteWebhook } from "@/lib/handlers/webhooks";
import { route } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
export const DELETE = route<P>(async (req, { params }) =>
  handleDeleteWebhook(appContext(), req, (await params).id),
);
