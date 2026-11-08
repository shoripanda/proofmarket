// Proof for the official MCP Registry that we control proofmarket.fun (HTTP domain authentication), so the server
// can be published as fun.proofmarket/proofmarket (server.json at the repository root). The Registry fetches this
// with a non-browser client and needs a plain 200 with no redirect. The value is the PUBLIC key; the private key
// is kept by the owner outside the repository. To rotate: generate a new Ed25519 key, replace this line, deploy,
// then log in again with mcp-publisher.
export const MCP_REGISTRY_AUTH = "v=MCPv1; k=ed25519; p=M2TKePuYWm9WZR50h2kK3rkCHiVpwb2BoVJuo58x+Yc=";

export const dynamic = "force-static";

export const GET = () =>
  new Response(`${MCP_REGISTRY_AUTH}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
