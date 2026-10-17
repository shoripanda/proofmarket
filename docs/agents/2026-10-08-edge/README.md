# Briefs for parallel work (distinctive features and a beginner's path, 2026-10-08)

Authoritative design: `specs/proofmarket/implementation/en/13-edge-features.md` ("the design" below). Background: `docs/pitch/07-landscape-and-edge.md`. Requirements: 01 §4.26.

The owner opens one Claude Code session per workstream in the terminal and asks each one:

```
Read docs/agents/2026-10-08-edge/README.md and docs/agents/2026-10-08-edge/<your brief>, then carry that work through to the end
```

**Agents do not start sub-agents of their own (Agent / fork / Workflow).** One session owns one workstream and carries it through to the end.

## Assignments

| Owner | Brief | Contents (section of the design) | Main places touched | Size |
|---|---|---|---|---|
| A | `A-rising-bounty.md` | A reward that rises with urgency (§1), including Solana program v1.1 | `programs/`, `packages/solana`, `requester-service`, `worker-service`, `settlement-jobs`, worker list and detail | Large |
| B | `B-onchain-facts.md` | Facts other programs can read (§2) | `packages/sdk`, `apps/web/app/v1/public/`, `apps/web/app/r/[id]`, `docs/onchain-facts.md` | Medium |
| C | `C-attestation-and-scale.md` | Attesting an agent's claim (§5) and a sensory scale (§4) | `api.ts`, `answers.ts`, worker capture screen, `views.ts`, proof page, `/developers` samples | Medium |
| D | `D-worker-assist.md` | In-browser help for workers (§6): read-aloud, voice answers, capture guidance, sounds | `apps/web/app/(worker)/`, `apps/web/components/ui.tsx`, new `apps/web/lib/client/speech.ts` and `sound.ts` | Medium |
| E | `E-onboarding.md` | A beginner's path (§7): a 30-second animated explainer with narration, plain words, illustrations, /workers, a first-run tour for workers, read-aloud on /try | `apps/web/app/(site)/`, `apps/web/components/`, `apps/web/public/audio/` | Large |
| F | `F-optimistic.md` | Optimistic verification (§3) | `verification-service`, `requester-service`, `task-engine`, new `challenge-service`, API, MCP, webhooks | Large |
| G | `G-location-privacy.md` | Rounding locations on public surfaces (PR 7 of §9) | `public-service`, `map-service`, `bundle.ts`, proof page, dataset | Small–medium |

The main session (the agent that wrote these briefs) lands migration `0023_edge_features` and `schema.ts` on main first (PR "db: migration 0023"). **Everyone starts only after that PR is on main** (`db: migration 0023` visible in `git log origin/main --oneline | head`). If it is not, ask the owner.

## Rules for everyone

### Before starting
1. Read the repository's `CLAUDE.md` (especially the failure log) and `AGENTS.md`. Read your whole section of the design. Where unclear, follow the design's decisions (§0) and do not change the design on your own. If you want to change it, give the reason in the PR description.
2. Create your own worktree; two sessions switching branches in the same folder breaks things.
   ```
   cd ~/proofmarket && git fetch -q && git worktree add ../proofmarket-<owner> -b <branch> origin/main
   cd ../proofmarket-<owner> && pnpm install
   git config user.email 131566598+shoripanda@users.noreply.github.com && git config user.name shoripanda
   ```
   **Do not run** `pnpm build` (the Next.js build) in a worktree (it costs 1 GB of disk; CI runs it).
3. Set your row in `docs/agents/2026-10-08-edge/STATUS.md` to "in progress" and include it in your first commit.

### Forbidden
- `git stash`, `git checkout <other branch>` (inside a worktree), `git commit -am`, `git push --force`.
- Writing to production (Supabase, Vercel, proofmarket.fun, the Solana devnet Config). The exception is A's program deployment (steps in that brief).
- Adding migration files. If a column is missing, tell the main session (write it in STATUS.md).
- Implementing another owner's section. Only your own.

### Places that collide easily
- Several owners touch `packages/core/src/schemas/api.ts`, `packages/core/openapi.json`, `packages/core/src/domain/enums.ts` and `apps/web/lib/answers.ts`. Before opening a PR, `git fetch && git rebase origin/main` and regenerate with `pnpm openapi` before committing. On conflict, keep the other side's change and add yours.
- A, C and F each add one sentence to the MCP tool descriptions (`packages/mcp/src/tools.ts`). Do not delete existing sentences.
- When adding to the failure log in `CLAUDE.md`, append exactly one line at the end.

### Finishing
1. Locally pass `pnpm typecheck`, `pnpm exec biome ci .`, `pnpm --filter @proofmarket/core exec vitest run` and `pnpm --filter @proofmarket/web exec vitest run --no-file-parallelism` (serially when the machine is loaded).
2. `git fetch && git rebase origin/main` → push → `gh pr create`. Title `feat(<owner's English name>): ...`. In the description, give the design section and how the "done when" was checked. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
3. Once CI (program / typescript / secrets) is all green, you may run `gh pr merge <number> --merge --delete-branch` yourself (approved by the owner). `gh pr merge` goes through even before CI finishes, so confirm pass with `gh pr checks` first.
4. Mark your row in STATUS.md "done" and write what you learned (pitfalls, leftovers) in at most 3 lines. This may be committed and pushed directly to main (this one file only).
