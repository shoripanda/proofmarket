#!/usr/bin/env -S npx tsx
// ProofMarket MCP server (stdio). Env: PROOFMARKET_API_KEY, PROOFMARKET_BASE_URL.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProofMarketClient } from "@proofmarket/sdk";
import { CANCEL_TOOL, GET_TOOL, REQUEST_TOOL } from "./tools.ts";

const notImplemented = (pr: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: `NOT_IMPLEMENTED (${pr})` }],
});

export function createServer(_client: ProofMarketClient): McpServer {
  const server = new McpServer({ name: "proofmarket", version: "0.1.0" });
  const { name: rName, ...rDef } = REQUEST_TOOL;
  const { name: gName, ...gDef } = GET_TOOL;
  const { name: cName, ...cDef } = CANCEL_TOOL;
  // PR-13: map to ProofMarketClient; return the JSON body as text + structuredContent.
  server.registerTool(rName, rDef, async () => notImplemented("PR-13"));
  server.registerTool(gName, gDef, async () => notImplemented("PR-13"));
  server.registerTool(cName, cDef, async () => notImplemented("PR-13"));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apiKey = process.env.PROOFMARKET_API_KEY;
  const baseUrl = process.env.PROOFMARKET_BASE_URL;
  if (!apiKey || !baseUrl) {
    console.error("PROOFMARKET_API_KEY and PROOFMARKET_BASE_URL are required");
    process.exit(1);
  }
  await createServer(new ProofMarketClient({ apiKey, baseUrl })).connect(new StdioServerTransport());
}
