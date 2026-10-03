// DEV_MODE only: issue a worker invite for local E2E runs. 404 in every other environment.
import { appContext } from "@/lib/context";
import { env, isDev } from "@/lib/env";
import { issueInvite } from "@/lib/services/worker-service";

export async function POST() {
  if (!isDev(env())) return new Response(null, { status: 404 });
  const code = await issueInvite(appContext().db, { uses: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  return Response.json({ invite_code: code });
}
