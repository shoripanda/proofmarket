// POST /v1/verifications/quote — what a request would cost, nothing reserved (docs/architecture 04 §4.2).
// Auth: requester. Comes before /v1/verifications/[id] in Next's matching because it is a static segment.
import { appContext } from "@/lib/context";
import { handleQuote } from "@/lib/handlers/requester";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleQuote(appContext(), req));
