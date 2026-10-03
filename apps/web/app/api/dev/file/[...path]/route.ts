// DEV_MODE only: serves derived images that would be Supabase signed download URLs.
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { DEV_DATA_DIR } from "@/lib/context";
import { env, isDev } from "@/lib/env";

type P = { params: Promise<{ path: string[] }> };
export async function GET(_req: Request, { params }: P) {
  if (!isDev(env())) return new Response(null, { status: 404 });
  const rel = normalize((await params).path.join("/"));
  if (rel.startsWith("..") || !rel.startsWith("evidence-derived/"))
    return new Response(null, { status: 404 });
  try {
    return new Response(readFileSync(join(DEV_DATA_DIR, "storage", rel)), {
      headers: { "content-type": "image/jpeg" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
