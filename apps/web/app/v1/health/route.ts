// GET /v1/health — liveness only (PR-01 exit criterion, 10 §3). No dependencies, no secrets.
export function GET() {
  return Response.json({ ok: true });
}
