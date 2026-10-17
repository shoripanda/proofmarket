# 02. Template analysis: no layer to replace; four patterns to adopt

Written: 2026-10-14 / Scope: [solana-foundation/templates](https://github.com/solana-foundation/templates) commit `d7961ba` (2026-10-11) / npm versions and publish dates as of 2026-10-14

## 1. Purpose

This covers steps 2 and 4 of the brief. We checked the six priority templates (kit/nextjs, kit/nextjs-anchor, solana-chatgpt-kit, x402-template, eve-pay, phantom-embedded-react) in their actual code and judged whether ProofMarket can reuse them. To avoid guessing features from names, we read each template's package.json, README and main sources. Three more turned out to be closely related and are covered too (kit/nextjs-keychain, community/kit-node-solanax402, community/supabase-auth).

## 2. Current state: the repository

templates is the material for `create-solana-dapp`, under the MIT licence (LICENSE at the root). It is grouped into kit (10 `@solana/kit` templates), web3js (8, of which 6 are legacy), mobile (6) and community (21); `templates.json` and `TEMPLATES.md` are generated with `pnpm generate`. AGENTS.md is a working agreement for AI agents and requires that "templates which automate wallets or transactions state the boundaries of authentication, authority and user approval".

Maintenance differs between official (kit) and community. According to `docs/agents/known-gotchas.md`, the automated template tests (`test-templates.yml`) exclude community. `pnpm health`, added in 2026-10 (machine checks for install, build and dependency freshness), covers every template, but does not guarantee that community code actually works.

Last commit dates and dependency freshness of the six:

| Template | Last commit | Main dependencies (template's range → latest on npm) | Licence |
|---|---|---|---|
| kit/nextjs | 2026-10-02 | `@solana/kit` ^7.0.0 → 8.5.0, `@solana/surfpool` ~1.5.0 | MIT |
| kit/nextjs-anchor | 2026-09-10 | `@solana/kit` ^6.3.0 → 8.5.0, `anchor-lang` 1.1.2, `litesvm` 0.10.0, Codama 1.10.0 | MIT |
| community/solana-chatgpt-kit | 2026-09-10 | `x402-solana` ^0.1.1 → 3.0.1, `mcp-handler` 1.1.0 → 2.3.0, `@modelcontextprotocol/sdk` 1.26.0 | MIT |
| community/x402-template | 2026-09-10 | `x402-next` ^1.1.0 → 1.2.0 (last published 2026-04-16), `viem` ^2.38.5 | MIT (README) |
| community/eve-pay | 2026-07-14 | `eve` 0.22.5 → 0.79.0, `ai` 7.0.22, `@solana/addresses` 6.9.0 | not stated (root MIT applies) |
| community/phantom-embedded-react | 2026-09-10 | `@phantom/react-sdk` ^2.0.2 → 2.0.4, `@solana/web3.js` ^1.95.0 | ISC (package.json) |

The shared last commit of 2026-09-10 comes from a bulk PR upgrading Next.js to 16.3.4 (#463), not from changes to the content. eve-pay has not been touched since its first commit in July, and its dependency `eve` has moved from 0.22 to 0.79.

## 3. Requirements (judging criteria)

We follow the columns of the brief's table: target feature, current implementation, reusability (high / medium / low), changes needed, dependencies, security risk, recommendation (adopt / partly adopt / reject). "Adopt" means taking in the code, "partly adopt" means taking the design or the shape of part of the implementation, and "reject" means reference only. Compatibility with the existing code weighs most.

## 4. Proposed design (judgement per template)

### 4.1 kit/nextjs: reject (use the test setup as a reference)

A sample on `@solana/kit` v7 and `@solana/react` that discovers browser wallets through wallet-standard and sends SOL transfers, SPL token creation and transfers, and memos with one line, `client.sendTransaction([instruction])`. It includes cluster switching, balance display, toasts with Explorer links and error translation (`parseTransactionError`).

Two differences. First, our users have no browser wallet: workers never sign with their Privy embedded wallet, and agents come in with an API key or x402, so wallet-connection components have no use. Second, moving to `@solana/kit` can only be partial while `@anchor-lang/core` 1.2 assumes web3.js v1, leaving two sets of types (the same reason the existing spec 02 §1 rejected it).

The useful part is the test setup: it starts `@solana/surfpool` in-process and runs real wallet discovery and signing through jsdom. We currently start `solana-test-validator` by hand for localnet tests (the failure log in CLAUDE.md records its flakiness right after start-up); switching to Surfpool might let CI run near-real round trips. Surfpool is a native Rust addon, though, and whether it can load Anchor 1.2's SBPF v3 `.so` is unverified (an investigation item in Phase 1 of chapter 11).

| Item | Content |
|---|---|
| Target feature | Wallet connection, transfers, error display, test setup |
| Current implementation | Privy for connection, server-side web3.js v1 for transfers, PGlite and localnet for tests |
| Reusability | Low (connection, transfers), medium (test setup) |
| Changes needed | Do not take it in. Decide on Surfpool after investigating |
| Dependencies | `@solana/kit` 7-8, `@solana/surfpool` (native) |
| Security risk | None (client-side sample) |
| Recommendation | Reject |

### 4.2 kit/nextjs-anchor: partly adopt (client generation with Codama)

Shows an Anchor vault program (just deposit SOL into your own PDA and withdraw, 70 lines of Rust) and generating a typed `@solana/kit` client from its IDL with Codama (`codama.json`, `app/generated/vault/`). `signer.ts`, which wraps a wallet-standard signer in a `TransactionModifyingSigner`, is a careful touch that prevents a mismatch between signature and message when the wallet rewrites the transaction. The Cargo release profile (`overflow-checks = true`, `lto = "fat"`) matches ProofMarket's `Cargo.toml`.

The vault program itself is far simpler than ProofMarket's escrow (8 instructions, a Config PDA, 23 LiteSVM tests; Token-2022 support under review in PR #42), so there is nothing to take from it. Codama is what is valuable. Today `packages/sdk/src/onchain.ts` (where the public result page checks the chain from the browser) reads the Task account by hand with web3.js v1. Generating a kit client from the IDL with Codama would move only the browser side to the lighter `@solana/kit` while the server-side Anchor client stays. The IDL is already checked for drift in CI, so the generated code can go through the same check.

| Item | Content |
|---|---|
| Target feature | Program ↔ web integration, PDAs, escrow |
| Current implementation | `Program` from `@anchor-lang/core` and hand-written PDA functions (`packages/solana/src/pda.ts`) |
| Reusability | Medium |
| Changes needed | Add `codama.json` and switch the reads in `packages/sdk/onchain` to the generated client. No server change |
| Dependencies | `codama` 1.10, `@codama/nodes-from-anchor`, `@codama/renderers-js`, `@solana/kit` (browser only) |
| Security risk | Low. The generated code is used read-only |
| Recommendation | Partly adopt (Phase 1) |

### 4.3 community/solana-chatgpt-kit: partly adopt (the ChatGPT widget)

Puts an MCP server (`mcp-handler`) for the ChatGPT Apps SDK in Next.js and drives Jupiter swaps, SOL transfers, balances and staking in natural language. Each tool registers an HTML widget as an MCP resource, and ChatGPT renders it through the `openai/outputTemplate` metadata. There are two wallet modes: a secret key on the server (`SOLANA_PRIVATE_KEY`) or signing in the browser wallet. In the latter, the transfer API charges a 0.001 USDC fee with `x402-solana` and delegates verification to the PayAI facilitator. The header is x402 v1 `X-PAYMENT`.

Our MCP is already public over HTTP (OAuth 2.1, 8 tools) and works as a ChatGPT and claude.ai connector, so no MCP implementation is needed. Our x402 is also further along: v2 headers, our own facilitator, every MUST of the spec verified. A secret key on the server is a form the brief forbids, so we do not take it.

What is worth adopting is having ChatGPT draw a result view. Today `get_reality_verification` returns JSON with a link to the proof page (`/r/[id]`). As an Apps SDK widget it could show the photo verdict and the proof page inside ChatGPT. Apps SDK metadata is OpenAI-specific and has no effect in claude.ai; add it once there is demand.

| Item | Content |
|---|---|
| Target feature | Connecting AI agents to Solana, tool calls, authority |
| Current implementation | Remote MCP (`apps/web/app/mcp`, `packages/mcp`), x402 v2 |
| Reusability | Low (MCP, x402), medium (widget) |
| Changes needed | Add the widget HTML as an MCP resource, written with the existing `@modelcontextprotocol/sdk`, not `mcp-handler` |
| Dependencies | None added (Apps SDK metadata is strings) |
| Security risk | The widget runs in an iframe; keep secrets out of it |
| Recommendation | Partly adopt (Phase 3, optional) |

### 4.4 community/x402-template: reject

A sample that puts a payment gate on a page with `paymentMiddleware` from `x402-next`. The recipient, network (`solana-devnet`), facilitator (`https://x402.org/facilitator`) and a Coinbase Developer Platform client key come from env vars, and a person pays on the Coinbase Pay screen. Types borrow EVM's `viem` `Address`. The README contains a CDP client key in plain text, which deserves a caution as a sample.

The user differs from ours. This template is a **person paying in a browser**, and it issues a session cookie. Ours is an **agent paying programmatically**, where the payment itself authenticates the request. Also, `x402-next` 1.2.0 was last published on 2026-04-16, and Coinbase's x402 moved to `@x402/core` and `@x402/svm` (2.28, published 2026-09) around the same time. There is no reason to ride the older line.

| Item | Content |
|---|---|
| Target feature | x402, HTTP-based payment, USDC payment, payment verification |
| Current implementation | `POST /v1/x402/verifications` (v2, our own facilitator) |
| Reusability | Low |
| Changes needed | None |
| Dependencies | `x402-next` (maintenance winding down), `viem`, a CDP key |
| Security risk | Depends on an external facilitator and CDP; key written in the README |
| Recommendation | Reject |

### 4.5 community/eve-pay: partly adopt (the approval gate and re-checking terms)

A sample on Vercel's Eve (an agent runtime) that reads HTTP 402 payment terms, waits for a person's approval and then pays in a Pay.sh sandbox. Despite x402 in the name, the protocol it uses is MPP (terms base64url-encoded in a `WWW-Authenticate` header), not x402. The mechanism is small: `inspect_stock_quote` extracts the terms (amount, mint, recipient, network), `buy_stock_quote` always stops for a person with `approval: always()`, and after approval it fetches the terms again and refuses to pay if anything differs. The README's "boundaries before production" are practical: approval every time or a separately reviewed spending policy; show and verify recipient, amount, mint, network and fee payer; keep limits and a recipient allow list in code; use an idempotency key for payments; confirm settlement on chain; keep signing authority in a KMS or MPC.

ProofMarket is the one being paid, but the same pattern helps in two places. One is `scripts/x402-agent.ts` (our sample agent), which pays a 402 as soon as it receives it; showing the terms, waiting for approval and re-fetching the terms before sending would make it a better example. The other is the MCP tools: `request_reality_verification` reserves the balance the moment it is called. A two-step "quote → confirm" that returns the cost first makes it easier for agent runtimes (Eve, Claude's approval features) to stop for a person (chapter 04). We do not adopt Eve itself; we are not the side that runs agents.

| Item | Content |
|---|---|
| Target feature | Agent payments, payment authority, approval, spending limits, abuse prevention |
| Current implementation | The sample agent pays without approval; MCP reserves at call time |
| Reusability | Medium (pattern only) |
| Changes needed | Approval and term re-check in the sample agent, a quote step in MCP, checking spending limits (chapter 08) |
| Dependencies | None added |
| Security risk | None; it lowers risk |
| Recommendation | Partly adopt (Phase 3) |

### 4.6 community/phantom-embedded-react: reject (recorded as an alternative)

A sample of Phantom's embedded wallet SDK (`@phantom/react-sdk` 2.0) that logs in with Google, Apple, Phantom or a browser extension and gets a Solana address. You pass an appId and redirectUrl to `PhantomProvider`; the screen is just a connect button and a balance. The README points to Phantom's MCP server (`@phantom/mcp-server`, 28 tools), which lets Claude Desktop operate the wallet.

Privy already meets the worker requirements (log in with email or Google, never think about a wallet, never sign), and switching to Phantom would not change the worker experience. Migrating would mean re-assigning every worker's wallet and changing the destination of past payouts. Rejected. We record it as an alternative of the same embedded-wallet kind in case Privy's pricing or policy changes.

The other point of contact is the requester side: a Claude with Phantom's MCP server could sign x402 payment transactions on the spot. Worth mentioning on `/developers` as one way to connect (Phase 3, documentation only).

| Item | Content |
|---|---|
| Target feature | Wallet auth, connection state, sessions, mobile |
| Current implementation | Privy (`@privy-io/react-auth` 3.46) |
| Reusability | Low |
| Changes needed | None |
| Dependencies | `@phantom/react-sdk`, an appId from Phantom Portal |
| Security risk | Migration requires re-assigning wallets |
| Recommendation | Reject |

### 4.7 Three more templates

**kit/nextjs-keychain: candidate to adopt (Phases 2-5).** Puts 13 signing backends behind one interface, `SolanaSigner` from `@solana/keychain` 2.0 — a local key, HashiCorp Vault, AWS KMS, GCP KMS, Turnkey, CDP, Privy, Fireblocks, Dfns, Para, Crossmint, Openfort and Utila — switched by env vars alone. Keys never reach the browser; a server route handler only signs. This directly answers the brief's "do not store secret keys unprotected on the server" and the operator-key problem in 15 §4.2. The catch: `SolanaSigner` extends `@solana/kit`'s `TransactionPartialSigner`, a different type from ProofMarket's web3.js v1 `Keypair`. What gets signed is the transaction bytes, though, so a thin bridge suffices: convert the message from `VersionedTransaction.serialize()` into kit's shape and take the signature back (chapters 05 and 08). The template's own README warns that its signing API has no authentication.

**community/kit-node-solanax402: reject.** An x402 implementation with separate Express facilitator and server, SOL transfers and its own nonce for replay protection. Ours keeps the facilitator in-process and protects against replay with `x402_payments` keyed by the transaction ID (the fee payer's signature). There is no reason to split the service for now.

**community/supabase-auth: reject.** Logs in with a wallet signature through Supabase's Web3 auth. We have a policy of not using wallet signatures for authentication (`api-contract.md`), and do not use Supabase Auth.

## 5. Rationale (summary of judgements)

| Template | Judgement | Key reason |
|---|---|---|
| kit/nextjs | Reject | Users have no browser wallet; moving to kit is blocked by the Anchor client |
| kit/nextjs-anchor | Partly adopt | Codama can generate the browser-side read client |
| solana-chatgpt-kit | Partly adopt | Only the ChatGPT widget pattern; our MCP and x402 are further along |
| x402-template | Reject | Built for people paying, on an outdated dependency line |
| eve-pay | Partly adopt | Move the approval gate and term re-check into the sample agent and MCP |
| phantom-embedded-react | Reject | Privy suffices; recorded as an alternative |
| nextjs-keychain | Candidate to adopt | A signing interface that moves the operator key to a KMS or MPC |
| kit-node-solanax402 | Reject | No reason to split out the facilitator |
| supabase-auth | Reject | Wallet-signature authentication is ruled out by policy |

Against the brief's most important instruction — do not make using templates the goal — not one template's code is taken in as is. That is because in the 12 days since 2 October ProofMarket had already built the layers the templates offer; their value is in confirming which boundaries the official side says to keep.

## 6. Alternatives

- Moving fully to `@solana/kit`. Anchor 1.2's TS client requires web3.js v1, so the escrow send path would have to be hand-written again; not worth it now. Re-evaluate when Anchor ships a kit client
- Replacing verification with the `x402-next` or `x402-solana` npm packages. Our own implementation covers every MUST in the spec and has tests. Absorbing version churn from an external package (`x402-solana` went from 0.1 to 3.0 in a year) is riskier
- Switching to Phantom's embedded wallet. Rejected as in 4.6

## 7. Security considerations

The boundary to learn from the templates is summed up by one line in their AGENTS.md: "templates for agents, MCP, wallets and transaction automation must state the boundaries of authentication, authority and user approval". ProofMarket's `/developers` page and MCP tool descriptions do not say when the cost is reserved (guess: users do not know the balance drops the moment `request_reality_verification` is called). Chapter 04 writes this boundary into both the docs and the API.

Two cautions if template dependencies are taken in. Many community dependencies are not pinned (`x402-solana` ^0.1.1), so `pnpm install` yields different versions from the README. And native addons such as Surfpool need an explicit entry in `allowBuilds` in `pnpm-workspace.yaml`, or postinstall is blocked (failure log in CLAUDE.md, 2026-10-02).

## 8. Implementation issues

- Decide whether Codama's output is excluded from `biome` formatting or formatted after generation (check for drift in CI, like the IDL)
- The bridge between `@solana/keychain` and web3.js v1 is small, but a test must pin that the transaction bytes do not change across signing
- Apps SDK widgets need ChatGPT's developer mode, and testing locally needs a tunnel (the failure log in CLAUDE.md, 2026-10-03, has a note on HMR)

## 9. Test strategy

Each of the four adopted patterns has a place in the existing test layers: the Codama client against fake accounts in `packages/sdk/test/onchain.test.ts`, the keychain bridge against the fake RPC in `packages/solana/test/send.test.ts` and localnet, the MCP quote step in `apps/web/test/mcp-http.test.ts`, and the sample agent's approval through the 402 round trip in `apps/web/test/x402.test.ts`.

## 10. Open questions

- Whether to use Surfpool instead of localnet in CI (loading SBPF v3 is unverified)
- Whether to build the ChatGPT widget (demand unverified)
- Which keychain backend to use (AWS KMS, GCP KMS, Privy server wallets and Turnkey are all unverified for ProofMarket; decide on cost and reachability from Vercel)
