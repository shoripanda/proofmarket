# Submission materials (ProofMarket, Colosseum submission on 10/12)

Written: 2026-10-04 (owner D). Materials are in one folder per kind; the numbers give the reading order.

| Folder | File | Contents | When to use |
|---|---|---|---|
| `01-canvas/` | `canvas.md` | The 10 items of the Hackathon Canvas, and answers to Matty Taylor's 6 questions | The base for all materials. Read first |
| `02-deck/` | `deck-en.md` | Structure of the 12-slide pitch deck: title, message, visual idea, talk track | When making slides |
| `03-videos/` | `pitch-video.md` | Pitch video script (2:50), English narration | Recording 10/7–10/11 |
| | `demo-video.md` | Technical demo script (2:45) and a list of 11 screens to record | Same |
| | `hype-video.md` | Trailer script (30 s), captions and sound only | Pinned X post, submission page |
| | `render/README.md` | How the submitted videos were actually rendered (synthesized narration, Playwright, ffmpeg) | When re-rendering |
| `04-x-posts/` | `README.md` | Posting rules, and posts that depend on other owners' work | Read before posting |
| | `personal.md` | 10 posts for the personal account (published in Japanese; English translation), with image ideas and reply links | Daily, 10/5–10/12 |
| | `project-en.md` | 10 posts for the project account (English) | Same number on the same day |
| | `testers-2026-10-09.md` | Posts recruiting agent-side and worker-side testers | From 10/9 |
| `05-workers/` | `recruiting-messages.md` | Worker recruiting messages (acquaintances, universities, X) | 10/5–10/10 |
| | `worker-guide.md` | First steps for workers. Send as is with the invite code | To people who join |
| `06-business-scale.md` | | Estimating business scale around the division of roles between agents and people (8 areas, existing market figures, working hypotheses). The base of pitch v3 | When changing external messaging or site wording |
| `07-landscape-and-edge.md` | | Map of competitors as of 2026-10 (people-hiring markets, field data collection, DePIN, oracles), where to expand, 7 feature ideas no one else has, and the 3 to build first | Before adding features, when talking about differentiation |
| `08-revenue-model.md` | | How ProofMarket makes money | When discussing fees and pricing |

## What you (the owner) fill in

[Brackets] in the materials are to be filled in. Count them per file with `grep -c "\[" docs/pitch/*/*.md`.

### Numbers (copy from `/stats`; never guess)

Completed requests, workers, total paid (USDC), median time from request to result, submissions Claude sent back, those that passed after resubmission, number of outside developers and their feedback, days since launch.
Where they appear: `canvas.md`, slide 9 of `deck-en.md`, 2:08 in `pitch-video.md`, 2:20 in `demo-video.md`, X posts 4, 8 and 9.

### What only you can write

1. **The founder's story**: questions 1, 2 and 6 in `canvas.md`, slide 10 of `deck-en.md`, 2:28 in `pitch-video.md`. Answering these three fills it in:
   - What research you asked an AI for got stuck because of on-site or paper information?
   - Why did you think "checking" matters more than "asking"?
   - Why will you keep going after the hackathon?
2. **The opening of the pitch video**: currently a generic scene, not an invented story. Replace it if you have a real experience (end of `pitch-video.md`)
3. **The first entry point**: confirm whether it is "information in Japan that exists only on paper and on site" (`canvas.md`, slide 3 of `deck-en.md`)

### Preparing recruiting and recording

- Contact details, how many requests to ask for and over what period, invite codes (`05-workers/`)
- The shop to film for the demo, and the shop owner's consent (`demo-video.md`, `hype-video.md`)

## Parts that depend on other owners' work

| Dependency | Where used | Status (as of 10/4) |
|---|---|---|
| A: x402 | Slide 6, pitch video 1:55, demo 0:10, X post 2 | In progress. If it does not land, switch to MCP (steps in each script) |
| B: up to 4 photos | X post 6, step 5 of the worker guide | Merged to main |
| C: `/stats` | Slide 9, the results scene of each video, X posts 4 and 9 | In progress |
