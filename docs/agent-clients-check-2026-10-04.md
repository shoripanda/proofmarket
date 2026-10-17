# Checking connections from other AIs to the production MCP (owner E)

Written: 2026-10-05 / Target: https://proofmarket.fun/mcp / Brief: `docs/agents/E-agent-clients.md`

## Results

| Client | Result | Checked | Notes |
|---|---|---|---|
| Claude Code (API key in a header) | **Connected** | 2026-10-05 | With `claude -p --mcp-config`, 4 tools were visible and a `get_reality_verification` call reached the server (an ID in the wrong format correctly returned 32602) |
| REST (curl) | **Connected** | 2026-10-05 | Calling `tools/list` directly returned 4 tools. Without a key, 401 with `WWW-Authenticate: Bearer resource_metadata=...` |
| OAuth public metadata | **Complete** | 2026-10-05 | `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. Registration, authorization and token endpoints, PKCE S256, public clients only |
| claude.ai connector | **Connected** | 2026-10-06 | Registered `https://proofmarket.fun/mcp` as a custom connector. After OAuth (dynamic client registration → API key on ProofMarket's consent screen), 7 tools were visible from a conversation |
| Codex CLI (API key in an env var) | **Connected** | 2026-10-10 | `codex mcp add proofmarket --url https://proofmarket.fun/mcp --bearer-token-env-var PROOFMARKET_API_KEY` → `codex exec` returned the tool names (Codex CLI 0.145.0; the default gpt-6-astra was unavailable in this version, so run with `-m gpt-5.5`). OAuth (`codex mcp login`) documented only |
| ChatGPT (developer-mode connector) | Server ready, connection not checked | 2026-10-10 | To meet OpenAI's requirements (S256, registration_endpoint, RFC 9207 iss), added `authorization_response_iss_parameter_supported: true` to the metadata, and registration now accepts any `token_endpoint_auth_method` as a public client. The actual connection is to be tried on the owner's ChatGPT (Plus or above, developer mode) |
| Cursor etc. | Not checked | — | Steps only |

## Test request placed

- Creating a request over MCP was stopped by Claude Code's automatic check (a real transaction), so none was placed from this session. Instead, one request was placed in production with the x402 sample agent (`ver_01M43J9C0R5H04CE9XCW83D7HA`, DOCUMENT_TRANSCRIPTION, 0.1 USDC) and went through 402 → payment → 201 → OPEN (owner A's production steps).

## Fixed

- The sample agent sent location-requiring requests without a location and always got 400 (PR #43 now handles 17 types).
- Public results returned text answers and the AI's check notes (fixed in PR #45).

## Remaining

- Actually connect from claude.ai and ChatGPT, place one request and read the result. If it fails, investigate `apps/web/app/oauth/` and `.well-known/` from the on-screen text.
- Once checked, update the "checked" marks on `/developers` (`CLIENTS[].checked`).
