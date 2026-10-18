# Briefs for parallel work (ProofMarket, final push before submission)

Written: 2026-10-04 16:00 JST / Schedule: `docs/proofmarket-schedule-2026-10.md`

The owner opens one Claude Code session per workstream in the terminal and asks each one:

```
Read docs/agents/README.md and docs/agents/<your brief>, then carry out that work
```

**Agents do not start sub-agents of their own (Agent / fork / Workflow)**, because they use a lot of tokens. One session owns one workstream and carries it through to the end.

## Assignments

| Owner | Brief | Contents | Main places touched | Estimate |
|---|---|---|---|---|
| A | `A-x402.md` | x402: an endpoint where anyone can pay USDC and request without an API key, plus a sample agent that pays and requests | `apps/web/app/v1/x402/`, `apps/web/lib/services/`, `scripts/` | 2.5 h |
| B | `B-multi-photo.md` | Up to 4 evidence photos | `evidence-service.ts`, capture screen, `review-runner.ts` | 2 h |
| C | `C-stats-and-copy.md` | A public results page `/stats`, and rewording the site's headline copy | `apps/web/app/(site)/` | 2 h |
| D | `D-pitch-materials.md` | Pitch materials, scripts for 3 videos, X posts, worker recruiting copy (documents only) | `docs/pitch/` | 2 h |
| E | `E-agent-clients.md` | Checking connections from Claude, ChatGPT etc. to the production MCP / API, and a page with connection steps | `apps/web/app/(site)/developers/`, `docs/` | 1.5 h (needs the owner at the screen) |

## Rules for everyone

### Before starting
1. Read the repository's `CLAUDE.md` (especially the failure log) and `AGENTS.md`.
2. Set your row's status in `docs/proofmarket-schedule-2026-10.md` to "in progress" (commit it in your own PR).
3. Work in a copy of the repository. Two sessions switching branches in the same folder at once breaks things, so first create your own worktree:
   ```
   cd ~/Solana-idea && git fetch -q && git worktree add ../Solana-idea-<owner> -b <branch> origin/main
   cd ../Solana-idea-<owner> && pnpm install
   git config user.email 131566598+shoripanda@users.noreply.github.com && git config user.name shoripanda
   ```

### Places that collide easily
- A, B and C all touch `packages/core/src/schemas/api.ts` and `packages/core/openapi.json`. Before opening a PR, `git rebase origin/main` and regenerate with `pnpm openapi` before committing.
- DB migration numbers are fixed in advance: **A uses 0019, B uses 0020**. C, D and E create no migrations. Drizzle works even if numbers are skipped.
- When adding to the failure log in `CLAUDE.md`, append one line at the end only (do not reorder).

### Do not touch production
- No `db:migrate` against Supabase, no Vercel settings, no production admin API (`/v1/admin/*`), no writes to the production DB. If something is needed, write it in the PR body and your report as "steps needed in production". Production work is done together by the owner's first session (the one that wrote these briefs).
- Secrets live only in `~/.config/proofmarket/`. Never write them in the repository, PRs or chat.

### Finishing
1. `pnpm exec biome check --write .`, then `pnpm exec biome ci .` with 0 errors.
2. `pnpm typecheck`, `pnpm --filter @proofmarket/web exec vitest run --no-file-parallelism`, `pnpm -r --filter '!@proofmarket/web' run test`.
3. If screens or the API changed, `APP_ENV=demo pnpm build` (judge by the exit code).
4. Japanese prose (screen copy, specs, materials) goes through the `natural-japanese` skill's checks.
5. Push and open a PR, ending the body with the attribution lines Claude Code provides.
6. Once CI (typescript, program, secrets) is green, you may merge with `gh pr merge --merge` yourself (approved by the owner). A failing Vercel preview is not a reason to stop unless the code is at fault.
7. Mark your row "done" in `docs/proofmarket-schedule-2026-10.md`, and write any production steps under "Steps needed in production" at the end of the same file (a separate PR is fine).
8. Finally, report briefly to the owner in Japanese: the PR URL, what was built, what was checked, steps needed in production, what was left.

### When unsure
The spec in `specs/proofmarket/implementation/en/` is authoritative. Before changing scope or P0 requirements, write the reason in the spec first (a rule in `CLAUDE.md`). Ask the owner when unsure. Do not widen scope on a guess.
