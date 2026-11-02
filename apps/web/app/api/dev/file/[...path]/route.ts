// DEV_MODE only: serves derived images (and audio clips) that would be Supabase signed download URLs.
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { DEV_DATA_DIR } from "@/lib/context";
import { env, isDev } from "@/lib/env";

type P = { params: Promise<{ path: string[] }> };
export async function GET(_req: Request, { params }: P) {
  if (!isDev(env())) return new Response(null, { status: 404 });
  const rel = normalize((await params).path.join("/"));
  const audio = /^evidence-raw\/.+\.(m4a|webm)$/.exec(rel);
  if (rel.startsWith("..") || !(rel.startsWith("evidence-derived/") || audio))
    return new Response(null, { status: 404 });
  try {
    return new Response(readFileSync(join(DEV_DATA_DIR, "storage", rel)), {
      headers: { "content-type": audio ? (audio[1] === "webm" ? "audio/webm" : "audio/mp4") : "image/jpeg" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
