// GET /.well-known/oauth-authorization-server — RFC 8414 metadata (05 §6.2).
import { authorizationServerMetadata, CORS, publicBase } from "@/lib/services/oauth-service";

export const GET = async (req: Request) =>
  Response.json(authorizationServerMetadata(publicBase(req)), { headers: CORS });
export const OPTIONS = async () => new Response(null, { status: 204, headers: CORS });
