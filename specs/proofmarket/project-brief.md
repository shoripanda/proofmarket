# ProofMarket Project Brief

Updated: 2026-10-02

## Product thesis

AI agents have software tools, but they do not have reliable eyes in the physical world.

ProofMarket provides a standardized escalation path:

> Ask a real-world question → dispatch a human witness → validate fresh evidence → return a machine-readable answer → settle on Solana.

## Beachhead

### Requester
AI agent developer/operator.

### Worker
A human witness in the pilot area.

### First use case
`PLACE_STATUS_VERIFICATION`

Example:

> Is this shop open right now?

### Why this wedge

- A judge understands it in tens of seconds
- The physical-world gap is obvious
- The answer is binary, so acceptance is easy to judge
- Photo + geofence + freshness demonstrate the proof pipeline
- The API result goes back into the agent workflow
- Solana settlement and attestation can be shown naturally

## Value proposition

### Agent side
Turn a web search's "probably" into "verified", with fresh human evidence.

### Worker side
Take short, nearby verification tasks and get paid on clear completion criteria.

### Platform side
Provide a physical-world verification primitive, not a task marketplace. (2026-10-16: general tasks were added next to verifications; see `requirements.md` §7.)

## Product promise

A requester should be able to ask:

```
Is location X open right now?
```

and receive:

```
VERIFIED: OPEN
2/2 witnesses agree
geofence: pass
freshness: pass
evidence anchored: yes
settlement: complete
```

without manually coordinating with a human.

## MVP business model hypothesis

Initial hypothesis:

- requester pays verification fee + worker bounty
- ProofMarket takes a platform fee
- high-assurance verification uses multiple witnesses and costs more

The exact fee rate is not fixed in the MVP; decide it by measuring actual worker cost, response time and requester willingness to pay. (2026-10-16: set at 15% on top of the bounty.)

## Main assumptions to validate

1. Agent developers pay for fresh real-world evidence
2. There is demand for issuing tasks from an API or MCP
3. Workers take short verification tasks
4. Photo, location and freshness checks establish a minimum of trust
5. Multi-witness verification adds value
6. Solana settlement and attestation add value over a centralised payout DB

## Success for hackathon

Success is not "the platform is finished" but showing that:

- Actual human verification works
- It starts from an actual agent or API request
- Evidence validation is visible
- The Solana transaction and attestation are visible
- The result goes back to the agent
- There is real user feedback, even from a few people

## Non-goal

Do not use the "AI replaces humans" narrative.

Treat ProofMarket as **human-in-the-loop infrastructure that explicitly calls on human perception, presence and action** at the boundary where software cannot reach the physical world.
