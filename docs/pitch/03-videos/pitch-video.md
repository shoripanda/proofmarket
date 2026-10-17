# Pitch video script (2:50)

Written: 2026-10-04 / Matches: the slides in `../02-deck/deck-en.md`
Length: target 2:50 (limit: under 3 minutes). The narration is about 340 words; read at a calm 130 words per minute or so, it fits.
Speaker: the owner (voice and appearance). [Brackets] are filled in by the owner before recording.

## Recording rules

- Speak in English for the judges
- Copy numbers from `/stats` on the day of recording, into the [brackets], before reading
- Screen recordings from `demo-video.md` may be reused
- Burn in English captions (some judges watch without sound)

## Shot list

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:12 | A photo of a closed shutter; beside it an agent UI reading "Open (per web data)" | Ask an agent whether a restaurant is open tonight. It answers from web data that may be weeks old. It has no way to check, because it isn't there. |
| 0:12–0:32 | Three-step diagram: request → person works → photo and text arrive → "?" | Agents can already hire people for real-world tasks. Several services do that. But when the photo and the answer come back, the agent still can't tell if the work matches what it asked for. So a human checks it, or nobody does. |
| 0:32–0:47 | Three images: a shop notice, a paper document, a phone | We start where this hurts most: information in Japan that only exists on paper or on-site. Store notices, paper documents, things you only learn by phone. |
| 0:47–1:10 | The flow diagram lights up left to right | ProofMarket returns the result of human work in a form the agent can trust. The bounty goes into escrow on Solana. A worker does the task on their phone. Every submission passes automated checks, then Claude reviews it against the request. When witnesses agree, the result hash is recorded on Solana and the worker is paid. |
| 1:10–1:40 | Fast-forward of the demo video: request → sent back → rewritten → passed | Here's the part that matters. An agent asks a worker to transcribe a notice. The worker sends a summary instead. Claude sends it back: "This is a summary, not a transcription." The worker rewrites it, it passes, and the agent gets structured JSON it can act on. |
| 1:40–1:55 | Solana Explorer: the escrow, result record and payout transactions | Escrow, the result record, and the payout are all on Solana. Anyone can verify them later. |
| 1:55–2:08 | MCP code and x402's 402 response | Any agent can use it over REST or MCP. With x402, an agent can pay in USDC and ask without signing up. [Cut this line if A's PR has not landed] |
| 2:08–2:28 | The `/stats` screen with three big numbers | Since launch, [completed] requests have been completed by real people, and [USDC paid] USDC has gone to [workers] workers. Claude sent back [sent back] submissions, and [fixed and accepted] were fixed and accepted. |
| 2:28–2:42 | The owner's face | [Owner: one or two sentences on why you are building this] |
| 2:42–2:50 | URL and two QR codes | If you build agents, send us one request today. If you're in Tokyo, join as a worker. |

Total narration: about 330 words excluding [brackets]. Once filled in, time it aloud; if it goes past 2:55, shorten 0:32–0:47.

## About the opening line

The 0:00 story is strongest replaced with the owner's own experience. The script holds no invented story, only a scene that could happen to anyone. If there is a real experience, replace it in the same 12 seconds with:

> [When did an agent (or a web search) give you a wrong answer about something physical? What was it, and what happened?]
