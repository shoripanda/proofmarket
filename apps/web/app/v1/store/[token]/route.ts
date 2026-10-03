// GET / POST /v1/store/{token} — a shop reads and files its own status report (01 §4.13). Auth: the secret link.
import { appContext } from "@/lib/context";
import { readJson, route } from "@/lib/http";
import { fileReport, storeInfo } from "@/lib/services/store-service";

type P = { params: Promise<{ token: string }> };
export const GET = route<P>(async (_req, { params }) =>
  Response.json(await storeInfo(appContext(), (await params).token)),
);
export const POST = route<P>(async (req, { params }) =>
  Response.json(await fileReport(appContext(), (await params).token, await readJson(req)), { status: 201 }),
);
