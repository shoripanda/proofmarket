// GET /v1/health/ready — for an outside uptime monitor: 200 when the database answers and the minute tick keeps
// up, 503 otherwise. /v1/health stays a dependency-free liveness check.
import { appContext } from "@/lib/context";
import { readiness } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await readiness(appContext());
    return Response.json(r, { status: r.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { ok: false, checks: { database: false } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
