#!/usr/bin/env -S npx tsx
// ProofMarket MCP server (stdio). Env: PROOFMARKET_API_KEY, PROOFMARKET_BASE_URL, PROOFMARKET_PRINCIPAL_REF.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProofMarketClient } from "@proofmarket/sdk";
import { createServer } from "./server.ts";

export { createServer };

if (import.meta.url === `file://${process.argv[1]}`) {
  const apiKey = process.env.PROOFMARKET_API_KEY;
  const baseUrl = process.env.PROOFMARKET_BASE_URL;
  const principalRef = process.env.PROOFMARKET_PRINCIPAL_REF;
  if (!apiKey || !baseUrl || !principalRef) {
    console.error("PROOFMARKET_API_KEY, PROOFMARKET_BASE_URL and PROOFMARKET_PRINCIPAL_REF are required");
    process.exit(1);
  }
  await createServer(new ProofMarketClient({ apiKey, baseUrl }), { principalRef }).connect(
    new StdioServerTransport(),
  );
}
