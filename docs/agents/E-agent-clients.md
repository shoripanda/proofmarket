# Owner E: checking connections from other AIs to production, and a connection-steps page

Branch: `docs/agent-clients` / worktree: `../Solana-idea-e` / DB migration: none
**This workstream needs the owner at the screen.** When asking for an action, give the exact URL to open and where to click.

## Why
Prove with the real product, before judging, that "other AI agents can use it". The production MCP (`https://proofmarket.fun/mcp`, with OAuth dynamic registration) has only passed local tests.

## What to do
1. **Connect Claude Code to the production MCP**
   - With an API key: `claude mcp add --transport http proofmarket https://proofmarket.fun/mcp --header "Authorization: Bearer <key>"`. The key is `API_KEY` in `~/.config/proofmarket/env.requester`. **Never write the key in chat or a PR.** Use local scope, and when done remove it with `claude mcp remove` or check with the owner.
   - Check that the tool list appears, place one location-free request (e.g. `DOCUMENT_TRANSCRIPTION`), and read its status with `get_reality_verification`. Keep requests at 0.5 test USDC or less with a deadline within 3 hours. Tell the owner before asking workers to do work.
2. **Connect from a claude.ai connector** (owner's action): Settings → Connectors → Add custom connector → URL `https://proofmarket.fun/mcp`. The OAuth screen should ask for the API key to be pasted. Once connected, have the owner try placing a request and reading the result in a conversation. If it fails, ask for the on-screen text and investigate (`apps/web/app/oauth/`, `.well-known/`).
3. **Connect from ChatGPT** (owner's action): try whichever is available now, a ChatGPT connector (MCP) or GPT Actions (loading `packages/core/openapi.json`). Check the latest official instructions with WebSearch before giving steps.
4. **Fix what failed.** If the fix is in code, fix it on this branch and include it in the PR.
5. **Connection-steps page**: add a "Connect from each AI" section to the developer page (`apps/web/app/(site)/developers/page.tsx`): Claude Code, claude.ai, ChatGPT, MCP clients such as Cursor, and REST (curl). Separate what was actually checked from what was not. Owner A writes the x402 section; do not touch it.
6. Record the results in `docs/agent-clients-check-2026-10-04.md` (which client, what worked, what did not; for screenshots, note only where they are).

## Do not touch
- How requests, submissions and verdicts work (bugs found may be fixed, but do not widen scope).
- The production DB and Vercel settings.

## Done when
- For each of Claude Code, claude.ai and ChatGPT, whether it connected or where it stopped is recorded.
- The connection-steps page is live in production (published automatically on merge).
- The README's "Finishing" is satisfied.
