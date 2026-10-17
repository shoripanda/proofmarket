# Retelling ProofMarket as "a market that lends agents a human body and senses", not "17 kinds of work"

Written: 2026-10-08. A first draft written after feedback on pitch video v2. The feedback had two points: going to shops and copying paper is too narrow a view, and think about how big this can get as a business. The reader is the owner. The three decisions needed are at the end.

## Central claim

AI agents and people have weaknesses that point in exactly opposite directions. An agent reads, compares and summarizes vast amounts of information at once, and can even build products. But it has no body. It cannot stand on site, and does not know heat, smell or a view. A person can stand there and check with their senses, but handles little information at once, slowly. ProofMarket's value lies in being the connection point across this asymmetry. Checking whether a shop is open or transcribing a notice is just the first work to pass through that point. It is the entrance, not the whole.

So neither the pitch nor the site should lead with "17 kinds of work". **The subject is "lending agents a human body and senses"**, with the 17 kinds placed behind it as examples.

| | AI agent | Person |
|---|---|---|
| Reading at once | Millions of pages | A few pages |
| Speed | Seconds | Minutes to hours |
| Can stand on site | No | Yes |
| Senses | None (photos and text only) | Can say hot, cold, smelly, a nice view |
| Best role | Ask the question. Compare results, decide what next | Go. Feel. Confirm |

## Today's 17 types show only a corner of the connection point

The 17 types in the spec (01 §4.15) lean towards "answer an on-site fact as a choice or a number". With `CUSTOM_TASK`, `SITE_REPORT` and `CUSTOM_CHOICE`, anything can actually be requested, yet the presentation looks like shop-front checks. Regrouping and showing the areas that can be requested works better than adding types.

| Area | Whose agent requests | Possible with today's types? | What is missing |
|---|---|---|---|
| Local business and maps (opening, queues, stock, prices) | Travel, dining, maps | Yes | Nothing. Today's main battlefield |
| Retail shelf and price audits | Manufacturers, wholesalers | `PRICE_CHECK`, `STOCK_CHECK`, `SITE_REPORT` | A bulk-ordering API. Watches (§4.23) can make it recurring |
| Condition checks for insurance and real estate | Insurance, real estate | `SITE_REPORT`, `PRODUCT_INSPECTION`, 4 photos | How to handle work that enters a building (open issue 2 below) |
| Proof that something "was there" in delivery and supply chains | Logistics, e-commerce | Photo + location + time = the proof page itself | A field on the request for a parcel or asset identifier |
| Fresh real-world data for AI training and evaluation | AI companies, research | The public dataset `/data` (CC BY 4.0) is the entry point | Batch requests issuing thousands at once |
| Care, safety and accessibility checks | Municipalities, families | `scope=anywhere`, watches | Nothing |
| Sensory judgements (taste, smell, texture, view) | Dining, tourism, real estate | `CUSTOM_CHOICE`, `SITE_REPORT` | How to check them (open issue 1 below) |
| Lending hands (receive, hand over, be present) | Every area | No. Today it only "checks" | State transitions for work that takes time, and how to price it |

The top six rows can be requested today just by changing the wording, with no spec change. The bottom two are the next extensions.

## Estimating scale

Verified numbers and my own assumptions are written separately.

**Verified numbers.** Mystery shopping alone is a $2.3 billion market worldwide (2025; estimates from Straits Research and Fortune Business Insights are both around $2.3 billion). Streetbees, which audits retail shelves with crowds of people, has raised $40 million. Estimates of total gig-economy volume for 2025–26 range from $455 billion to $582 billion. All of these sell "people checking on site" or "asking people for short tasks" to human buyers, taking days to weeks from request to answer.

**Assumptions (estimates).** When the buyer changes from a person to an agent, the number of questions grows by orders of magnitude and the price per item falls by orders of magnitude. Mystery shopping today costs thousands of yen per visit, a few times a month; an agent pays 0.3 USDC per item and asks every time it needs to. At 10,000 a day in Japan alone at 300 yen each, volume is 1.1 billion yen a year; with a 15% fee, revenue is 160 million yen. At 1 million a day worldwide at $0.5 each, volume is $180 million a year. This "1,000×" also went into the pitch, but it is not measured; it is a working hypothesis to build the business on, and the video says so in a note.

What matters is not the unit price but the count. Two things drive the count: "ease of asking" and "being able to use the answer without doubting it". The former is covered by MCP, REST and x402. The latter is ProofMarket's core (mechanical checks, Claude's review, agreement among several people, the Solana record), and it does not change as areas widen.

## Proposed changes

1. **Wording.** Rewrite the site headings, `/developers` and the MCP descriptions with "lending agents a human body and senses" as the subject. Move the 17 types one step down as "examples you can request today". Pitch v3 was already built in this order
2. **One example per area.** Do not add types; put one example request (JSON) for each of the six areas in the table on `/developers`, so developers start from their own area's example
3. **Batch requests.** Add an API that issues hundreds of the same request with only the place changed. Retail audits and AI data cannot start without it
4. **Lending hands** comes after checking work is running. It needs state transitions (received, handed over) and time-based pricing, so write a spec first

## Open issues and current view

**1. Claude cannot check sensory answers.** Whether "this room feels damp" or "this shop smells good" is right cannot be judged from a photo. View: for this area, make agreement among several people (2–3) and worker trust levels (4 tiers) the main checks, and limit Claude's review to "does it fit the shape of the request". No spec change is needed; the requester just sets `witnesses` to 2 or more.

**2. How to handle work that enters a building.** Condition checks for insurance and real estate involve going inside. The policy so far has been "do not add safety rules". View: keep the policy and start with requesters stating "accompanied" in the request text. Make rules once problems appear.

**3. 0.3 USDC is too cheap for sensory judgements.** Nobody takes work involving travel and time for 30 cents. View: requesters already set rewards freely, so the spec does not change. But example requests should carry plausible going rates per area (3–5 USDC for on-site judgements).

## Decisions needed

- May the subject change to "lending agents a human body and senses"? If so, proceed with rewriting the site and `/developers`
- Add the batch request API before submission (10/12) or after? My view is after, listing it in the submission as "what we build next"
- Is checking sensory judgements by agreement among several people the right framing?
