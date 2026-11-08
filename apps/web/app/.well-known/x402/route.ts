// x402 discovery document (x402scan docs/DISCOVERY.md): the paid resources on this origin. Newer tools read
// x-payment-info in /openapi.json first; this stays for the ones that still read it. docs/ops/x402-discovery.md
export const GET = (req: Request) => {
  const origin = new URL(req.url).origin;
  return Response.json(
    {
      version: 1,
      resources: [`${origin}/v1/x402/verifications`],
      instructions: `POST with no body for the terms and an example body (extensions.bazaar), then POST the body with a PAYMENT-SIGNATURE header. Details: ${origin}/llms.txt`,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
};
