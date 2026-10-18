# Technical demo video script (2:45)

Written: 2026-10-04 / Limit: under 3 minutes
Flow shown: an agent requests (x402 or MCP) → the worker app → Claude sends it back → fixed and passed → escrow, result record and payment in Solana Explorer → `/stats`
Narration in English (for the judges). [Brackets] are filled in on the day of recording.

## Storyline

The request is `SIGN_TRANSCRIPTION` (transcribing a sign or notice), because anyone can understand why it gets sent back.

- What the agent asks: "Transcribe the opening-hours notice at this shop's entrance exactly as written"
- First try: the worker summarizes it as "Weekdays 11:00–20:00, closed Sundays" → Claude sends it back (a summary, not a transcription)
- Second try: the worker copies the notice word for word → passes → finalized → paid

Film at a shop whose owner agreed to filming [shop name and whether consent was given]. Shoot at an angle where no faces appear.

## Shot list

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:10 | Title "ProofMarket — technical demo" and an architecture diagram (agent / API / worker app / review / Solana) | This is ProofMarket running on Solana devnet. An agent asks a person to do something it can't do itself, and gets back a result that's been checked. |
| 0:10–0:35 | Terminal: run `scripts/x402-agent.ts`. 402 response → payment signature → retry → 201 and a verification ID | The agent has a wallet and nothing else. No account, no API key. It calls our x402 endpoint, gets a 402 with the price, signs a USDC payment, and retries. The request is created. |
| 0:10–0:35 (alternative) | Claude Desktop or similar calling the MCP tool `request_reality_verification` | (If x402 is unavailable) The agent calls our MCP tool, request_reality_verification, with the question and the answer format. |
| 0:35–0:45 | Explorer: the escrow transaction (initialize_task) | The bounty is now locked in an escrow account on Solana. The worker knows the money is there before starting. |
| 0:45–1:05 | Phone screen recording: request list → open the request → accept → photograph the notice with the camera → type a summary and send | On the worker's phone, the task shows up in a browser app. They accept it, take a photo of the notice in the app, and type an answer. Here they've summarized it instead of transcribing it. |
| 1:05–1:20 | Phone: "Checking the content" → "Could not be confirmed" with the reason, "2 retries left" | Automated checks pass: the nonce, the time, the location, and the photo isn't reused. Then Claude reviews the photo and answer against the request, and sends it back with a reason the worker can act on. |
| 1:20–1:35 | Phone: retype the notice's text as is and send → "Confirmed" | The worker rewrites it word for word and resubmits within the same claim. This time it passes. |
| 1:35–1:55 | Terminal: the agent receives the result. Highlight `status: VERIFIED`, `checks` and `reviews` (Claude's verdict and reason) in the JSON | The agent receives structured JSON: the status, every check, and Claude's verdict for each accepted submission. It can branch on this without a human looking at the photo. |
| 1:55–2:20 | Explorer: the result record (finalize_verification) and payment (settle) transactions, compared with result_hash on the public result page `/r/<id>` | Two more transactions: the result hash is recorded, and the worker is paid from escrow. The public result page shows the same hash, so anyone can check that the result wasn't changed afterwards. The transcription itself stays off-chain; only its hash is public. |
| 2:20–2:35 | `/stats`: completed count, total paid, breakdown of Claude's reviews | Every completed request adds to our public stats. So far: [completed] requests completed, [USDC paid] USDC paid, [sent back] submissions sent back by review. |
| 2:35–2:45 | Back to the architecture diagram, with on-chain and off-chain colour-coded | On-chain: escrow, result hash, payment. Off-chain: photos, text, and the review. That split keeps workers' photos private and the outcome verifiable. |

## Screens to record

| # | Screen | How | Notes |
|---|---|---|---|
| 1 | Architecture diagram | Still image (made as a slide) | Colour-code on-chain and off-chain |
| 2 | Terminal: the x402 sample agent | Screen recording with large text (18 pt or more) | Record after A's PR is in production; otherwise use #3. Never show secrets (contents of key files, API keys) |
| 3 | Calling the MCP tool (backup) | Record in Claude Desktop or Claude Code | Record after E has confirmed the connection |
| 4 | Explorer: the escrow transaction | Browser recording (show the devnet label) | Show `?cluster=devnet` in the URL |
| 5 | Worker's phone: list → accept → capture → send | Phone screen recording | The location permission dialog may be cut. No faces |
| 6 | Worker's phone: "Checking the content" → sent back | Phone screen recording | Claude's review runs every 2 minutes via launchd on the owner's Mac. Cut the wait in editing, and show "(2 min skipped)" in a corner |
| 7 | Worker's phone: rewritten and passed | Phone screen recording | Resubmit within the same claim |
| 8 | Terminal: the result JSON | Recording, with the `reviews` and `checks` lines highlighted in colour | It shows text only the requester can see, so use only a notice whose shop consented |
| 9 | Explorer: result record and payment | Browser recording | Show the two transactions side by side |
| 10 | Public result page `/r/<id>` | Browser recording | Briefly show that no photo appears |
| 11 | `/stats` | Browser recording | Record after C's PR has landed |

## Check before recording

- Is there enough test USDC in the Devnet treasury?
- Is `com.proofmarket.review-runner` running on the owner's Mac? (If stopped, reviews stop and the request fails at its deadline)
- Is the worker account invited, and does it clear the trust-level conditions?
- Does the x402 sample agent's wallet hold test USDC?
