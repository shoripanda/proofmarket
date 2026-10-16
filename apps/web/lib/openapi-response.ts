import "server-only";
// The REST API description (packages/core/openapi.json, generated from the zod schemas and checked in CI), served
// from the site so agents find it where they look first: /openapi.json and /.well-known/openapi.json
// (docs/architecture 12 §5.1).
import spec from "@proofmarket/core/openapi.json";

export function openapiResponse(): Response {
  return Response.json(spec, {
    headers: {
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
