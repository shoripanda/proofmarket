# Competitors all stand level on "you can hire people". ProofMarket sharpens towards "an oracle for reality"

Written: 2026-10-08. Updates `specs/proofmarket/competitor-differentiation.md` (2026-10-02) to today, and collects where to expand and feature ideas no one else has. The reader is the owner. A proposal for "the 3 to build first" is at the end.

## Today's map (October 2026)

| Layer | Main players | Strengths | Weaknesses / gaps |
|---|---|---|---|
| Markets where agents hire people | RentAHuman (launched in February, over 500k sign-ups, $5–500/hour, MCP, stablecoin escrow), Human API ($65M raised, partnered with Eclipse, pays via Stripe Connect, a phone app leaning to voice and sensory work), Taskin (bounded tasks and structured results, no escrow), NeedaHuman (photos with GPS and a passphrase, 15% fee), Human4Hire, Apify's Hire a Human, HumanInLoop | Supply (sign-ups) and capital. Fiat payouts | Return one person's answer as is. No agreement among several people, no content check, no on-chain proof. One report notes RentAHuman claims 70k sign-ups but only 83 people are visible |
| Traditional field data collection | Premise ($30M revenue, 80 customers, 80k contributors in 30 countries; UNDP, the World Bank, Google, Bloomberg; index subscriptions and annual contracts), Streetbees ($40M raised), Field Agent, Gigwalk, Observa ($2–25 per task) | Corporate and government purchasing, indexes as a product, a supply network of people | The buyer is a human staff member. Days to weeks. Agents cannot call them |
| Passive sensor networks (DePIN) | Hivemapper, NATIX (maps and Physical AI data from dashcams and car cameras), FrodoBots (data from remote-controlled robots) | Always on, high volume, cheap | Cannot "answer a question". Cannot capture places cameras don't face, or smell and texture |
| Mechanisms that decide facts | UMA (an optimistic oracle: assert with a bond, dispute within a window, settle by vote; has started letting LLMs propose and dispute), Kleros (juries) | Usable from on-chain contracts. Mature dispute mechanisms | The deciders are not on site. They decide on on-screen evidence |

**Position.** ProofMarket fits none of these four layers. It takes "a person answers on site", like the top two, and returns it as "a fact other on-chain mechanisms can use", like the bottom two. Today's differences: agreement among several people, Claude's content check, Solana records of evidence and result hashes, acceptance criteria, multi-field answers, batch requests, watches, CC BY public data, and account-free use over x402. What is missing: supply (number of people), fiat payouts, and a form that fits corporate purchasing (contracts, indexes, invoices).

## Where to expand

1. **Borrow supply instead of building it.** Connect RentAHuman, Taskin and Human API as "supply-side adapters" and let ProofMarket be purely the verification layer. Requests come to ProofMarket, finding people goes to the partner, and returning submissions pass through our checks, review, agreement and recording. Ride on top of a 500k-person market instead of fighting it
2. **A Premise-style product.** Sell "indexes" bundling watches and batch requests by subscription (e.g. a Tokyo convenience-store price index, a Shibuya queue index). With the public dataset in place, indexes are a natural extension. Companies and municipalities only buy in this form
3. **A fiat path.** Human API and NeedaHuman both use Stripe Connect. Offer yen payouts for workers (§4.10) and invoice payment for requesters, with Solana kept as invisible plumbing
4. **An enterprise foundation.** Organization accounts, SLAs, bulk export of audit trails, Sheets and Slack integration (`06-business-scale.md`)

## Sharp feature ideas (none of the others have them, and they can be built on today's base)

**A. Optimistic verification.** Return the first person's answer immediately as "provisional"; during a challenge window the requester sets (say 30 minutes), other workers or agents can post a bond and challenge it. If challenged, extra witnesses re-check on site, and the losing side's bond goes to the winner. UMA's mechanism with "on-screen evidence" replaced by "a person on site". It gets speed (one person) and confidence (many) at once. The existing dispute → re-check (§4.12) and watches already cover 80% of it.

**B. Facts other Solana programs can read.** Result hashes are already on chain, but redesign them on the premise that other programs will use them. A Solana contract could decide directly "pay the insurance if this shop was closed" or "switch the booking if this queue exceeds 10 people". Add a function to the SDK that verifies the on-chain record, and put "how to read it from a program" on the `/r/{id}` proof page. The easiest difference for judges to appreciate; every competitor stops at a Web2 API.

**C. A reward that rises with urgency (rising bounty).** The requester sets only a ceiling, and the reward rises automatically over time. It ends the accident of requests sitting untaken, and expresses "urgent" as a market price. Competitors use fixed amounts. The implementation is small (`bounty.max`, the rise curve, fixed at the amount when claimed).

**D. A sense index.** Turn smell, noise, cleanliness and warmth into a standard 1–5 scale through agreement among several people. AI cannot capture this in principle, and camera networks do not have it. Human API leans to voice; this covers the senses on site in general. It can be requested today as a form choice field, so what is needed is standardizing the scales and judging by "the median of 3 or more people".

**E. People attest to agents' actions (the reverse direction).** An agent has a person look at "delivered" or "put the sign out" and receives it as proof. Usable for corporate audits, acceptance of outsourced work, and settlement conditions between agents. The mechanism is the same as today's requests; only the request template and the proof page wording change.

**F. Agents on the worker side too.** Capture guidance, automated transcription and translation in the worker app. Makes the "person + agent" pair work on both sides and raises each worker's throughput. Also an answer to the supply shortage.

**G. Proof of location without revealing location.** Show on chain only "was within the radius", without revealing the worker's exact position (zero knowledge). Heavy, so later, but hard for others to follow on privacy.

## The 3 to build first (proposal)

| Order | Idea | Why first | Size |
|---|---|---|---|
| 1 | C. Rising bounty | Lands in a day. With supply short right now, keeping requests from sitting untaken matters a lot | Small |
| 2 | B. Facts other programs can read | The strongest difference for judges. The records already exist, so an SDK verification function and an explanation on the proof page get there | Medium |
| 3 | A. Optimistic verification | Becomes ProofMarket's own verdict model. Built by recombining the dispute and watch mechanisms | Medium–large |

D (sense index) can be requested today with a form, so first put it on `/developers` as an example request and standardize the scales later. Supply adapters (expansion 1) need partnership negotiations, so after submission.

## Sources

- RentAHuman: Yahoo Tech / WIRED quotes (518k sign-ups, 100+ countries), Gadget Review (83 visible people), rentahuman.ai/docs
- Human API: HackerNoon ($65M, Eclipse, Stripe Connect), TechStartups 2026-04-01 (phone app)
- Taskin: trytaskin.ai, GitHub taskin-ai/trytaskin. NeedaHuman: needahuman.ai (GPS, passphrase, 15%)
- Premise: Getlatka ($30M revenue, 80 customers), Fortune 2015, press release ($85M raised). Streetbees: dealroom. Field Agent, Gigwalk, Observa: Micromoola / research.com
- Hivemapper, NATIX: Solana Compass, insights4vc. FrodoBots: dealroom
- UMA: blog.uma.xyz (optimistic oracle, LLM proposals and disputes). Kleros: interexy's comparison
