# X posts for the founder's personal account (10 posts)

These posts were written and published in Japanese; this is an English translation for reference. Rules and prerequisites: `README.md`. Links never go in the post body; what is listed under "Reply" goes in your own reply.

## 1. 10/5 (Mon) Introducing ProofMarket

> AI agents can now ask people to do work. But the agent itself cannot check whether the photo and answer that come back really match what it asked for.
>
> I'm building something to fill that gap: a system that returns the results of human work in a form the requesting AI can trust. Entering it in Colosseum.

- **Image/video**: the trailer (`../03-videos/hype-video.md`); if not ready, one flow diagram
- **Reply**: the site URL


## 2. 10/6 (Tue) Request without signing up (x402)

> Agents have no card and no bank account. All they have is a wallet.
>
> So ProofMarket works without creating an account. The first call returns "402 and a price"; if the agent signs a USDC payment and sends it again, that becomes the request.

- **Image/video**: a 15-second terminal recording of the sample agent: 402 → payment → 201
- **Reply**: the developer page URL


## 3. 10/7 (Wed) How send-backs work

> What I spent the most time on was "sending back".
>
> You ask for a transcription and get a summary; a requested item is missing. Submissions like that must not pass even if the photo's location and time are right. Claude checks the photo and answer against the request and returns it to the worker with a reason. The worker can fix it on the spot.

- **Image/video**: two phone screens side by side: "Could not be confirmed" with the reason → "Confirmed"
- **Reply**: the how-it-works page URL


## 4. 10/8 (Thu) First numbers

> [days] days since launch. [completed] requests completed by people, and [workers] workers so far.
>
> All the numbers are on a page anyone can see. I think publishing them while they're small earns more trust later.

- **Image/video**: a screenshot of `/stats`
- **Reply**: the `/stats` URL


## 5. 10/8 (Thu) Recruiting workers

> Looking for people in Tokyo to help with a few minutes of work on their phone.
>
> Requests come from AI agents: photograph what's in front of a shop, copy down a notice, that kind of thing. You decide each time whether to take one. No crypto knowledge needed. It's a trial, so rewards are in test USDC.

- **Image/video**: the request list screen in the worker app
- **Reply**: the worker page URL (`/workers`), where invite codes are requested


## 6. 10/9 (Fri) Up to 4 photos

> A worker told me "one photo can't fit the whole notice", so submissions can now carry up to 4 photos.
>
> [Replace with feedback actually received. If none, make the first sentence "Transcription requests often don't fit in one photo, so"]

- **Image/video**: a 10-second phone recording of taking and sending 4 photos
- **Reply**: none


## 7. 10/10 (Sat) Why Solana

> A request pays tens to hundreds of yen. That only works if fees are cheaper still.
>
> Also, the requesting agent and the worker don't know each other. With the reward in escrow up front, the worker doesn't have to wonder "will I get paid?". The result hash stays in a public ledger too, so anyone can check the operator didn't rewrite it later.

- **Image/video**: an image of the three Explorer transactions (escrow, result record, payment)
- **Reply**: the Explorer URL of one real transaction


## 8. 10/11 (Sun) What outside developers said

> [number] outside agent developers tried it. What resonated most was [summary of feedback].
>
> [One sentence on anything fixed in response]

- **Image/video**: a developer's agent calling the MCP tool (with their permission); if none, an image of the MCP connection-steps page
- **Reply**: the connection-steps page URL
- **Note**: get permission before quoting, and ask whether to use their name


## 9. 10/12 (Mon) Submitted

> Submitted ProofMarket to Colosseum.
>
> In 8 days, [completed] requests completed by people, with [workers] workers. [One sentence on the most memorable request]
>
> Not stopping after submission. Requests keep running every day.

- **Image/video**: the pitch video (3 minutes), exported to fit X's limit
- **Reply**: the submission page URL and the `/stats` URL


## 10. 10/12 (Mon) After submission, to agent developers

> If you're building agents that deal with information in Japan that exists only on paper and on site — shop notices, paper records, things you only learn by phone — try one request. If it doesn't work, I'll fix it.

- **Image/video**: a 20-second recording from calling the MCP tool to the JSON coming back
- **Reply**: the developer page URL
