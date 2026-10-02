# Competitor and Differentiation

調査基準日: 2026-10-02

## Conclusion

**“AI agents hire humans” is not a unique idea in 2026.**

ProofMarket must not pitch itself only as a marketplace where agents post jobs to people.

The defendable hypothesis is narrower:

> standardized real-world fact verification for agents, with machine-readable claims, freshness/location evidence, optional quorum, and Solana-native settlement/attestation.

## 1. Taskin

Publicly describes:
- AI workflows hire humans for bounded digital, physical and hybrid tasks
- REST and MCP
- participant discovery
- preflight
- structured result/evidence
- explicit task states
- direct settlement; current public reference says it does not provide escrow

Sources:
https://trytaskin.ai/
https://trytaskin.ai/docs
https://trytaskin.ai/api
https://trytaskin.ai/trust

### Overlap
Very high on agent-to-human API and structured human output.

### ProofMarket wedge
Not “structured tasks.” Instead:
- verification-specific schema
- geofenced/fresh physical claims
- multi-witness quorum
- canonical evidence/result root
- Solana settlement/attestation
- API returns a fact claim outcome, not general human work product

## 2. RentAHuman

Publicly describes:
- AI agent search/hire/post bounty
- real-world physical tasks
- REST / MCP
- evidence submissions/review
- escrow/payment workflow
- optional x402 USDC account funding on Base

Sources:
https://rentahuman.ai/for-agents
https://rentahuman.ai/docs

### Overlap
Very high on marketplace, bounty, evidence and agent API.

### ProofMarket wedge
Avoid competing as “better freelancer marketplace.”

Focus:
- no application/recruiting flow required for simple verification
- request is a claim needing observation
- standardized assurance profile
- multi-witness aggregation
- result consumed directly by downstream agent logic
- Solana-native proof/settlement layer

## 3. NeedaHuman

Publicly describes:
- AI agents hire humans for real-world physical tasks
- location and freshness code
- GPS/freshness-verified deliverable
- Stripe Connect payout
- public site explicitly says “Verification is the product.”

Source:
https://needahuman.ai/

### Overlap
Extremely high with physical verification thesis.

### Consequence
ProofMarket cannot claim “GPS + fresh photo verification” itself as unique.

### ProofMarket wedge
Must go beyond single-worker verified photo:
- standardized fact schema
- multi-witness consensus/quorum
- machine-readable aggregate result
- evidence root / result attestation
- agent payment/settlement integration on Solana
- assurance levels the agent can select

## 4. Human4Hire

Publicly describes:
- real-world tasks by humans
- API-first posting
- escrow
- photo proof
- worker authentication
- requester approval before payout

Source:
https://www.human4hire.ai/

### Overlap
Marketplace + escrow + physical proof.

### ProofMarket wedge
Again, not marketplace breadth. Verification primitive and consensus layer.

## 5. Differentiation matrix

| Capability | General competitors | ProofMarket target |
|---|---|---|
| General errands/tasks | Common | No, not MVP |
| REST/MCP | Common | Yes |
| Photo evidence | Common | Yes |
| GPS/freshness | Exists | Yes |
| Escrow/payment | Exists | Solana-native target |
| x402 | Exists in ecosystem/competitor funding | Optional API/funding path |
| Standard fact/answer schema | Partial | Core |
| Multi-witness quorum | Not assumed | Core P1 |
| Machine-readable consensus | Not assumed | Core P1 |
| Evidence/result root on public chain | Not assumed | Core |
| Reality-verification-only positioning | Mixed | Core |

“Not assumed” means this research did not verify absence across all product features. Do not claim competitors categorically lack a feature without rechecking.

## 6. What not to say in pitch

Do not say:
- “first AI-to-human marketplace”
- “nobody else lets agents hire humans”
- “first verified human task platform”
- “only platform with x402”

These claims are contradicted or unsupported by current public products.

## 7. Better pitch

> Existing platforms let agents hire people. ProofMarket turns human observation into a verification primitive: an agent asks a bounded question about the physical world and gets back a structured, auditable answer with selectable assurance.

## 8. Competitive test during hackathon

Interview at least 3 agent developers and ask:
1. Would you use a general human-task marketplace or a dedicated verification API?
2. Which result fields are necessary to automate the next step?
3. Is one witness enough?
4. What latency/cost is acceptable?
5. Does on-chain settlement/attestation matter?

If users prefer a general marketplace and do not value assurance/structured fact outputs, revise the wedge.
