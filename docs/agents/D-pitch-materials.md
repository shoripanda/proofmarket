# Owner D: submission materials (documents only)

Branch: `docs/pitch-materials` / worktree: `../Solana-idea-d` / no code

## Read first
- `docs/colosseum-hackathon-playbook-2026-09-16.md` (strategy notes: the pitch video matters most, under 3 minutes, structure, Red Flag Word List)
- `docs/colosseum-hackathon-winners-2024-2026.md` (past winners)
- `specs/proofmarket/competitor-differentiation.md` (differences from RentAHuman, Taskin, NeedaHuman)
- `specs/proofmarket/project-brief.md`, `problem.md`
- Sections 4.15–4.17 of `specs/proofmarket/implementation/en/01-requirements-definition.md` (what was actually built)
- "Direction" in `docs/proofmarket-schedule-2026-10.md`

## Direction (the materials follow it)
- Headline: **return the results of human work in a form the requesting AI can trust.**
- What sets it apart: an AI content check on every submission, agreement among several people, results recorded on Solana and payment through escrow, and requesting without sign-up over x402 (built today by owner A).
- First entry point (awaiting the owner's confirmation): information in Japan that exists only on paper and on site, out of AI's reach.
- **Do not invent numbers.** Leave placeholders such as `[completed count]` for the owner to fill from `/stats`.
- **Do not invent the founder's story.** Leave a clearly marked placeholder with three questions for the owner to answer.

## What to build (in `docs/pitch/`)
1. `canvas.md` — the Hackathon Canvas (problem, first narrow user, current alternative, unique value, why now, why crypto, why Solana, entry point for growth, MVP, numbers measured during the hackathon) and honest answers to Matty Taylor's six questions (placeholders where they cannot be filled).
2. `deck.md` — slide-by-slide structure of the pitch deck: Hook → Problem → Solution → Product → Demo → Business Model → Traction → Team → CTA, at most 12 slides. Each slide gets a title, a one-liner, an idea for the visual and the talking points. Japanese and English versions.
3. `pitch-video-script.md` — under 3 minutes. A shot list with timings and narration (English for the judges, Japanese translation alongside).
4. `demo-video-script.md` — a technical demo under 3 minutes: an agent requests over x402 or MCP → the worker app → AI sends it back → fixed and passed → escrow, result record and payment in Solana Explorer → `/stats`. With a list of screens to record.
5. `hype-video-script.md` — a 20–40 second trailer.
6. `x-posts.md` — 10 Build in Public posts for 10/5–10/12, for the founder's personal account (Japanese) and the project account (English). An image or video idea per post. Put links in a reply, not the first post. Few hashtags.
7. `worker-recruiting.md` — short recruiting messages for acquaintances, universities and X (Japanese), and a one-page "first steps for workers" (log in → invite code → take a request → photo and answer → AI check → reward).

Run Japanese text through the `natural-japanese` skill and check it against its criteria.

## Done when
- All seven files exist, and the list of placeholders for the owner is in the PR body and the report.
- The PR and report parts of the README's "Finishing" are satisfied (no code tests needed; just pass `pnpm exec biome ci .`).
