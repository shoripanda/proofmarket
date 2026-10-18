# AI_INSTRUCTIONS.md

The common entrance for AI agents working in this repository.

**The authoritative working rules are in [`AGENTS.md`](AGENTS.md). Read all of it before starting.**

Then read, in order:

1. `README.md`
2. `docs/proofmarket-concept-2026-10-02.md` (the product idea)
3. `specs/proofmarket/README.md` and the specs in the read order it lists
4. `specs/proofmarket/implementation/en/` (the implementation design)
5. `docs/solana-research-2026-09-11.md` (Solana technical notes; only when needed)

Key principles:

- Do not make using Solana the goal. First try to show that existing services or an ordinary database would do.
- Keep facts and hypotheses apart. Give statistics, institutions and competitor information a reference date and a primary-source URL.
- Never put personal data, photos or GPS on a public chain as they are. The chain holds hashes, state and settlement only.
- When a spec changes (requirements, API contract, acceptance criteria, security), update the spec before the code.
- Never commit `.env`, private keys or API keys. Local secrets live in `~/.config/proofmarket/`.
