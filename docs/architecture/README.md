# ProofMarket architecture design (2026-10-14)

Following the owner's brief "Architecture design and development using the official Solana Foundation templates", we studied the existing code and [solana-foundation/templates](https://github.com/solana-foundation/templates) and wrote down a design. **These documents are design only; they did not change production code.** Implementation starts once the owner approves the roadmap in chapter 11.

The conclusion first. ProofMarket's foundation (Next.js and Supabase, the Anchor escrow, Privy embedded wallets, the x402 window, MCP) is already running, and there is no layer the official templates should replace. What is worth adopting are the **patterns** the templates show: (1) show the terms and get approval before paying (eve-pay), (2) a signing interface that moves signing keys out to a KMS or MPC (nextjs-keychain), (3) generating a typed client from the IDL (Codama in nextjs-anchor), and (4) a widget that draws the result inside ChatGPT (solana-chatgpt-kit). The most urgent items are fixing the requester spending limits, which are stored in the DB but never checked, and rethinking where the operator key that will hold real money on mainnet lives. Both are design problems rather than template questions, and are covered in chapters 08 and 11.

| # | Document | Contents |
|---|---|---|
| 01 | [Current system](01-current-system.md) | Implementation status per feature (Implemented / Partial / Missing / Unknown) and facts checked in the code |
| 02 | [Template analysis](02-template-analysis.md) | Six priority templates and three closely related ones; adopt / partly adopt / reject |
| 03 | [Target architecture](03-target-architecture.md) | The diagram, and what changes and what stays |
| 04 | [Agent API specification](04-agent-api-specification.md) | Authentication, API keys, rate limits, permissions, idempotency, the missing list API |
| 05 | [Escrow design](05-escrow-design.md) | Accounts and instructions of the Anchor program, double-payment protection, key separation |
| 06 | [Payment design](06-payment-design.md) | Prepaid balance, x402, deposit detection, spending limits, throughput |
| 07 | [Verification design](07-verification-design.md) | Machine checks, AI review, human review, disputes; the risk of irreversible payments decided by AI alone |
| 08 | [Security design](08-security-design.md) | Countermeasures per threat, key management, kill switches, spending brakes |
| 09 | [Database design](09-database-design.md) | The role of the 39 tables, what the constraints guarantee, tables to add |
| 10 | [Migration plan](10-migration-plan.md) | The order of compatible changes, and how to roll back |
| 11 | [Implementation roadmap](11-implementation-roadmap.md) | Phases 1-5: work, dependencies, difficulty, done criteria |
| 12 | [RentAHuman study](12-rentahuman-benchmark.md) | How rentahuman.ai is built, a design to move ProofMarket toward it, decisions D1-D6 |
| 13 | [Moving to a marketplace](13-marketplace-migration.md) | Verifications and general tasks side by side, following the answers to D1-D6: tables, one on-chain Task per seat, the 15% fee, payment 24 hours after delivery, the order of the move |
| 14 | [Public profiles](14-public-profiles.md) | Stage 8: opt-in public worker profiles, preferred and blocked workers, ratings, the public task list |

On 2026-10-15 the owner approved implementation and decided the eight items in chapter 11 §10 (recorded there). The same day Phases 3, 1-2 and 4 and the widget went out as PRs #44-#47, and each change was added to the existing spec chapters (01 §4.29-4.30, 04 §3.28-3.29, 05 §1.2/§2.1b/§2.2a/§6.1, 06 §5.x, 08 §5-6, 12 §10.3, 15 §4.2).

The authoritative implementation design remains `specs/proofmarket/implementation/en/` (chapters 00-16); these documents do not replace it. A design decided here is added to the relevant chapter when it is implemented.

Method: for ProofMarket we read `origin/main` (commit `05d6544`, up to PR #37) and kept the unmerged PRs #39-#42 (multi-token and parallel settlement) apart as "under review". For the templates we cloned commit `d7961ba` of 2026-10-11 and read README, AGENTS.md, TEMPLATES.md and each template's package.json, README and main sources. npm publish dates and the last commit date of each directory were checked on 2026-10-14 through the GitHub API and the npm registry.
