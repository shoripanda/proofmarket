// GET /.well-known/oauth-protected-resource — RFC 9728 metadata for /mcp (05 §6.2).
import { CORS, protectedResourceMetadata, publicBase } from "@/lib/services/oauth-service";

export const GET = async (req: Request) =>
  Response.json(protectedResourceMetadata(publicBase(req)), { headers: CORS });
export const OPTIONS = async () => new Response(null, { status: 204, headers: CORS });
