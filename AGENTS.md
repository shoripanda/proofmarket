# AGENTS.md

This repository is the shared workspace for designing, building and running ProofMarket: a way for AI agents to ask people for what they cannot do themselves and get the answer back with evidence.

ChatGPT, Codex, Claude Code, OpenClaw and any other AI agent must read this file before starting work and follow the rules below.

## 1. What to read first

In this order, as a rule:

1. `README.md`
2. `docs/proofmarket-concept-2026-10-02.md` (the product idea and the wedge)
3. `specs/proofmarket/README.md` and every spec in the read order it lists
4. `specs/proofmarket/implementation/en/` (the implementation design)
5. `docs/solana-research-2026-09-11.md` (Solana technical notes; only when needed)

**Anyone implementing or changing ProofMarket must read `specs/proofmarket/README.md` and the specs it references.**

## 2. Purpose of the repository

The goal is not "to use Solana".

**Adopt Solana only where it solves a real social problem better than existing means, and move from research → hypothesis → PoC → MVP → production.**

## 3. Counter-arguments to run every time

When proposing a new idea or feature, always consider:

1. Does the social problem really exist?
2. Who is affected?
3. Are existing services or institutions already enough?
4. Why is an ordinary database such as PostgreSQL not enough?
5. Would a permissioned ledger be more appropriate?
6. If a public blockchain is needed, why Solana?
7. Can the UX keep users from having to think about wallets or SOL?
8. Can it be designed without putting personal data or trade secrets on-chain?
9. Is a fallback needed for network outages?
10. Is it compatible with Japanese law, administrative systems and industry regulation?

Generalities such as "it's transparent because it's a blockchain" or "it's fast because it's Solana" are not reasons to adopt it.

## 4. Source policy

### Social problems, institutions and statistics

In order of preference:

1. The Japanese government, ministries and local governments
2. Incorporated administrative agencies and public research institutes
3. International organisations
4. Universities and peer-reviewed papers
5. Reputable think tanks
6. Companies' own primary sources (for example, a competitor's own track record)

### Solana technology

In order of preference:

1. Official Solana documentation
2. Solana Foundation / official network research
3. The Solana whitepaper / protocol specifications
4. Primary sources such as validator clients and proposals
5. Peer-reviewed papers and research by international organisations

Do not rely on general news, SEO media, price-prediction sites or anonymous blogs as the only source for an important fact.

## 5. Classifying numbers

Do not mix up market-research numbers. Always treat a number as one of:

- `MARKET_SIZE`: the market for the product or service itself
- `INDUSTRY_SCALE`: the whole target industry
- `PROBLEM_SCALE`: social loss or impact
- `TRANSACTION_SCALE`: transaction or handling volume
- `AID_SCALE`: amount of support funding
- `ADOPTION`: users / companies / participants

Examples:

- Economic loss from food waste of ¥4 trillion = `PROBLEM_SCALE`
- Domestic pharmaceutical shipments of ¥12.8 trillion = `INDUSTRY_SCALE`
- Circular economy of ¥80 trillion = `INDUSTRY_SCALE`

Never present these as "this service's TAM".

## 6. On-chain data

As a rule, put only the minimum proof and state on a public chain.

Recommended:

- hash
- pseudonymous identifier
- signature
- state transition
- timestamp / slot
- settlement state
- entitlement / voucher state

Not allowed, as a rule:

- names
- addresses
- phone numbers
- email
- anything related to My Number (national ID)
- medical information
- sensitive information such as evacuation shelters or disaster damage
- trade secrets
- contract text
- large raw data

## 7. Main product hypothesis

Not a general gig marketplace, but a **Reality Verification Network where an AI agent asks a person to verify a fresh fact in the physical world and gets a machine-readable result**. The MVP centres on `PLACE_STATUS_VERIFICATION`. On 2026-10-04, `QUEUE_LENGTH` and `NOTICE_POSTED`, which can be checked from outside a shop, were added behind a per-API-key allow list (`specs/proofmarket/implementation/en/01-requirements-definition.md` §4.8). The same day, by the owner's decision, the scope widened to work that needs a person's hands: books, paper documents, physical objects and phone calls (17 task types, numeric and text answers, optional location, the shop allow list removed; §4.15). On 2026-10-08 requesters gained control of the shape of the work (multi-field `form` answers, `acceptance_criteria`, a 7-day deadline for location-free requests, and batch requests `POST /v1/verifications/batch`; §4.25; the 17 types became examples). On 2026-10-16 the owner decided to offer general tasks next to verifications (`docs/architecture/12-rentahuman-benchmark.md` and `13-marketplace-migration.md`). Raw photos and GPS stay off-chain; Solana is the minimal settlement and attestation layer.

## 8. Current priorities

**Finish the product while running production (https://proofmarket.fun) for the Colosseum Crypto World's Fair in autumn 2026 (deadline 2026-10-12).** Implementation decisions follow `specs/proofmarket/requirements.md` and `specs/proofmarket/acceptance-criteria.md`. To change a requirement, update `specs/proofmarket/implementation/en/01-requirements-definition.md` first.

## 9. Saving new research

Add a reference date to the file name where it helps.

Examples:

- `docs/solana-research-2026-09-11.md`
- `docs/agent-clients-check-2026-10-04.md`

Every piece of research includes at least:

1. The reference date
2. The conclusion
3. Facts
4. Inferences and hypotheses
5. Source URLs
6. Uncertainty
7. What to check next

**Keep facts and ideas clearly apart.**

## 10. Standard files for a spec

A project promoted to an implementation candidate gets:

```text
specs/<project>/
├── problem.md
├── users-and-stakeholders.md
├── requirements.md
├── architecture.md
├── onchain-data-model.md
├── offchain-data-model.md
├── privacy-security.md
├── legal-checklist.md
├── competitor-differentiation.md
├── mvp-plan.md
└── kpi.md
```

## 11. Implementation principles

- Keep the blockchain part minimal.
- Do not put all business logic on-chain.
- Make idempotency, replay protection and double-spend protection explicit.
- Verify on devnet or a local validator before considering mainnet.
- Never commit a private key to the repository.
- Never commit `.env`, secrets, API keys or seed phrases.
- Prefer UX that never forces users to hold SOL.
- Consider fee sponsorship, embedded wallets and passkeys.
- Do not issue assets or tokens whose legal status has not been checked.

## 12. Competitor research

"A similar service exists" does not mean "drop the idea".

Evaluate in this order:

1. Does it solve the same problem?
2. Does the same customer pay?
3. Is it the same workflow?
4. Does it use a blockchain?
5. Which chain and architecture?
6. Is it a pilot or in production?
7. How much adoption does it have?
8. What of the existing service would this not replace, and what could it complement?

Wherever possible, evaluate each one as a possible integration partner as well as a competitor.

## 13. The README

Keep the README short: the entrance and overview of the repository. Research, operations notes and submission materials go in `docs/`, specs in `specs/`.

When an agent adds an important new document, link it from the README or the relevant index as needed.

## 14. Reference dates

The Solana technical notes are as of **2026-09-11**. ProofMarket's specs, competitor research and legal checklist are as of **2026-10-02**.

Always re-check time-dependent numbers, institutions and Solana network specifications against the latest primary sources.
