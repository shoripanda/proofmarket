// The official MCP Registry entry (server.json) and the HTTP domain proof it relies on
// (/.well-known/mcp-registry-auth). A broken proof makes `mcp-publisher login http` fail with 401.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET, MCP_REGISTRY_AUTH } from "../app/.well-known/mcp-registry-auth/route";

const server = JSON.parse(readFileSync(new URL("../../../server.json", import.meta.url), "utf8"));

describe("MCP Registry", () => {
  it("serves one proof line with a 32-byte Ed25519 public key as plain text", async () => {
    const m = /^v=MCPv1; k=ed25519; p=([A-Za-z0-9+/]{43}=)$/.exec(MCP_REGISTRY_AUTH);
    expect(m).not.toBeNull();
    expect(Buffer.from(m?.[1] ?? "", "base64")).toHaveLength(32);
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe(`${MCP_REGISTRY_AUTH}\n`);
  });

  it("names the server under the domain the proof is served from, and points at the live /mcp", () => {
    expect(server.name).toBe("fun.proofmarket/proofmarket");
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.remotes).toEqual([{ type: "streamable-http", url: "https://proofmarket.fun/mcp" }]);
  });
});
