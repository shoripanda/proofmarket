# Pitch deck outline — English (11 slides)

Created 2026-10-04. Japanese version and owner notes: `deck-ja.md`. Video script: `../03-videos/pitch-video.md`.

[Brackets] are for the owner to fill in, using numbers from `/stats`.

## 1. Hook

- **Title**: ProofMarket
- **Message**: Agents can now hire people. They still can't tell whether the work they get back is real.
- **Visual**: A photo of a shuttered shop next to an agent UI saying "Open (per web data)"
- **Talk track**: Ask a booking agent whether a restaurant is open tonight. It answers from web data that may be stale. An agent that isn't there has no way to check. [Replace with the owner's own experience if there is one]

## 2. Problem

- **Title**: You can ask, but you can't verify
- **Message**: Services for hiring people exist. What's missing is checking the result and handing it back in a form software can use.
- **Visual**: Three steps: request → (a person works) → photo and text arrive → "Is this what I asked for?"
- **Talk track**:
  - Several 2026 services (RentAHuman, Taskin, NeedaHuman) let agents hire people
  - The requesting agent still has to judge whether the photo shows the right shop, or whether every requested field is there
  - It has nothing to judge with, so either a human reviews it or it goes unchecked

## 3. Beachhead

- **Title**: Information that only exists on paper and on-site in Japan
- **Message**: Store notices, paper documents, and answers you only get at a counter or by phone are out of reach for any agent, however capable.
- **Visual**: Three photos: a "temporarily closed" notice, a paper form at a city office, a phone handset
- **Talk track**: We start in Tokyo with this kind of information. [Owner to confirm the beachhead]

## 4. Solution

- **Title**: ProofMarket
- **Message**: We return the result of human work in a form the requesting agent can trust.
- **Visual**: Agent request → worker captures and answers → automated checks + Claude review → multi-witness agreement → record and payment on Solana → JSON back to the agent
- **Talk track**: The bounty goes into escrow when the request is made. A submission only counts after it passes both the automated checks and Claude's review. When witnesses agree, the result hash is recorded on Solana and the workers are paid.

## 5. Difference

- **Title**: How we differ
- **Message**: The difference isn't that agents can ask. It's that the result arrives already checked and ready to use.
- **Visual**: Comparison table with rows: hire people / photo + location checks / per-submission content review with send-back / multi-witness agreement / result hash on a public ledger / pay-and-ask without signup. Mark competitors where they have the feature
- **Talk track**: Hiring and photo + location checks exist elsewhere. We add the last four rows. We don't claim others lack them; we haven't verified that.

## 6. Product

- **Title**: What runs today
- **Message**: Any agent can ask the same way, over REST, MCP, or x402.
- **Visual**: Left: agent code calling the MCP tool. Right: the worker's phone screen
- **Talk track**:
  - 17 task types: whether a shop is open, queues, stock, prices, sign transcription, paper documents, phone inquiries, and more
  - Workers join from a phone browser. No crypto knowledge or wallet setup needed
  - With x402, an agent pays USDC and asks on the spot, with no API key signup (include after Track A's PR is merged)

## 7. Demo

- **Title**: Sent back, fixed, accepted
- **Message**: A submission that doesn't match the request is sent back with a reason. The worker fixes it, it passes, and the payment lands on Solana.
- **Visual**: Four frames from the demo video (request → send-back screen → accepted → Explorer). See `../03-videos/demo-video.md`
- **Talk track**: The moment to show is the send-back. Claude says "you summarized instead of transcribing," the worker rewrites it, and it passes.

## 8. Business Model

- **Title**: Pay per request
- **Message**: Agents pay per request: the worker bounty plus a verification fee. More witnesses means more assurance, at a higher price.
- **Visual**: Breakdown of one request: bounty × witnesses + fee
- **Talk track**: The fee is zero during the pilot. We'll set it after measuring worker cost, latency, and what requesters will pay. Reusing a recent result for the same shop returns an answer without sending anyone, at lower cost.

## 9. Traction

- **Title**: Traction (verifiable by anyone at `/stats`)
- **Message**: [completed] requests were completed by real people, and [USDC paid] USDC was paid to workers.
- **Visual**: Screenshot of `/stats`: three big numbers and a daily completions bar chart
- **Talk track**:
  - [workers] workers, median time from request to result [median] minutes
  - Claude sent back [sent back] submissions; [fixed and accepted] were fixed and accepted
  - [external devs] external developers tried it. Feedback: [quote one]

## 10. Team

- **Title**: Team
- **Message**: [Owner: one sentence on why you are the one to solve this]
- **Visual**: Photo, name, X handle
- **Talk track**: [Owner writes. Use the three questions in `deck-ja.md`, slide 10.]
  - Fact we can state: spec fixed on Oct 2; by Oct 4 the API, MCP server, worker app, Solana program, and AI review were live in production

## 11. CTA

- **Title**: Try it
- **Message**: Send one request from your agent today.
- **Visual**: Two QR codes (developer page and worker sign-up) and the URL
- **Talk track**: Agent builders: connect over MCP or x402 from the developer page. In Tokyo: join as a worker.
