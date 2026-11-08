# Publishing to the official MCP Registry

The official MCP Registry (registry.modelcontextprotocol.io) is where MCP clients and directories such as PulseMCP
look servers up. As of 2026-11-08 ProofMarket was in none of the registries checked (official MCP Registry, x402
Bazaar, PulseMCP, AgentVerse, ERC-8004). Glama lists an unrelated `proofmarket-mcp` by another author, so publishing
under our own domain also keeps the name ours.

## What is in the repository

- `server.json` at the root: the entry. Name `fun.proofmarket/proofmarket` (reverse DNS of proofmarket.fun), one
  `streamable-http` remote at `https://proofmarket.fun/mcp`. No header is listed because the endpoint does OAuth 2.1
  discovery; clients that take a bearer key are told how in `llms.txt`.
- `apps/web/app/.well-known/mcp-registry-auth/route.ts`: the HTTP domain proof, `v=MCPv1; k=ed25519; p=<public key>`.
- `apps/web/test/mcp-registry.test.ts`: checks the proof format and that `server.json` names our domain.

The private key is `~/.config/proofmarket/mcp-registry-key.pem` on the owner's laptop (mode 600). It is never
committed. Losing it only means generating a new pair, replacing the line in the route, deploying, and logging in
again.

## Steps (owner)

1. Merge the PR and wait for the production deploy. Then check the proof the way the Registry fetches it (200, the
   one line, no redirect):

   ```
   curl -sS -w '\n%{http_code}\n' -H 'Accept: text/plain' -A 'mcp-registry/1.0' https://proofmarket.fun/.well-known/mcp-registry-auth
   ```

2. Log in with the domain proof. macOS LibreSSL has no Ed25519, so use Homebrew's OpenSSL 3:

   ```
   PRIVATE_KEY="$(/opt/homebrew/opt/openssl@3/bin/openssl pkey -in ~/.config/proofmarket/mcp-registry-key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')" && mcp-publisher login http --domain proofmarket.fun --private-key "$PRIVATE_KEY"
   ```

   A 401 "token exchange failed" means the Registry could not fetch the proof: re-run the curl in step 1.

3. Publish from the repository root: `mcp-publisher publish`.

4. Check: `curl -s 'https://registry.modelcontextprotocol.io/v0/servers?search=fun.proofmarket'`.

## Updating the entry

Change `server.json`, raise `version` (the Registry refuses a version it already has), and run steps 2–3 again.
The login token is short-lived, so log in each time.
