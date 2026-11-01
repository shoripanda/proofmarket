// GET /v1/public/workers/{public_id} — one public worker profile (docs/architecture 14 §3). No auth.
import { appContext } from "@/lib/context";
import { handlePublicWorker } from "@/lib/handlers/profiles";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ publicId: string }> };
export const GET = route<P>(async (req, { params }) =>
  handlePublicWorker(appContext(), req, (await params).publicId),
);
