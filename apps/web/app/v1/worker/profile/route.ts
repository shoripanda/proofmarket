// GET / PUT /v1/worker/profile — the worker's own public profile (docs/architecture 14 §3). Auth: worker.
import { appContext } from "@/lib/context";
import { handleWorkerProfile } from "@/lib/handlers/profiles";
import { route } from "@/lib/http";

const h = route(async (req) => handleWorkerProfile(appContext(), req));
export const GET = h;
export const PUT = h;
