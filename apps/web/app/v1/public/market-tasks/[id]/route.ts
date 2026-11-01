// GET /v1/public/market-tasks/{id} — one open public task; 410 once closed (docs/architecture 14 §6). No auth.
import { appContext } from "@/lib/context";
import { handlePublicMarketTask } from "@/lib/handlers/public-market";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string }> };
export const GET = route<P>(async (req, { params }) =>
  handlePublicMarketTask(appContext(), req, (await params).id),
);
