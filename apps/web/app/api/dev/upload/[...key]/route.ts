// DEV_MODE only: stands in for the Supabase signed upload URL. 404 in every other environment.
import { join } from "node:path";
import { LIMITS } from "@proofmarket/core";
import { writeDevUpload } from "@/lib/adapters/dev";
import { DEV_DATA_DIR } from "@/lib/context";
import { env, isDev } from "@/lib/env";

type P = { params: Promise<{ key: string[] }> };
export async function PUT(req: Request, { params }: P) {
  if (!isDev(env())) return new Response(null, { status: 404 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > LIMITS.media.maxBytes) return new Response("too large", { status: 413 });
  writeDevUpload(join(DEV_DATA_DIR, "storage"), (await params).key.join("/"), bytes);
  return Response.json({ ok: true });
}
