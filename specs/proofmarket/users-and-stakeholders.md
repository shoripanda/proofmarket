# Users and Stakeholders

更新日: 2026-10-02

## 1. Primary requester

### AI Agent Developer / Operator

Who:
- builds or operates autonomous/semi-autonomous agents
- can call REST/MCP tools
- needs physical-world information during a workflow

Jobs to be done:
- “I need a fresh answer that does not exist reliably online.”
- “I need evidence I can audit later.”
- “I need the answer in a schema my agent can consume.”
- “I need to cap cost and deadline programmatically.”

Needs:
- predictable API
- bounded cost
- SLA/status
- structured result
- evidence provenance
- idempotency
- safe failure modes

Does not want:
- manually message workers
- inspect dozens of applications
- receive only unstructured chat
- manage worker payout manually

## 2. Human Witness / Worker

Who:
- willing to perform a short local verification
- has a smartphone
- can knowingly accept/decline tasks

Jobs to be done:
- see nearby eligible tasks
- understand exact completion criteria before accepting
- submit proof once
- know why a submission passed/failed
- receive payout after accepted work

Needs:
- clear task scope
- clear reward
- location radius
- deadline
- safety information
- privacy controls
- appeal/support path for incorrect rejection

Must always retain:
- ability to decline
- ability to stop unsafe work
- no obligation to accept future tasks

## 3. Responsible Principal

The human/company ultimately responsible for the agent.

MVP requirement:
Every requester API credential maps to a responsible principal. Anonymous autonomous agents must not be able to create unbounded real-world tasks with no accountable operator.

## 4. Verification Service

System role, not a human.

Responsibilities:
- geofence check
- freshness check
- nonce/task binding
- duplicate/replay check
- evidence schema validation
- optional AI image consistency check
- quorum aggregation

AI image checking is advisory unless a task defines it as a deterministic acceptance rule. It must not silently substitute for human observation.

## 5. Platform Operator

Responsibilities:
- task policy
- worker safety
- abuse response
- data retention
- payment/settlement configuration
- legal compliance
- incident investigation

## 6. Downstream consumer

Could be:
- travel agent
- shopping agent
- operations dashboard
- audit system
- another smart contract / service

Consumes:
`VerificationResult`, not raw worker workflow.

## Stakeholder conflicts

### Requester vs worker
Requester wants low cost; worker needs fair compensation.

### Speed vs assurance
Single witness is fast; quorum is more robust but slower/more expensive.

### Auditability vs privacy
More evidence improves auditability but increases privacy risk.

### Automation vs safety
Autonomous task creation is convenient but must be constrained by principal identity, policy and spend/task limits.

## MVP roles

Required:
- requester
- worker
- platform verifier
- responsible principal

Optional/stretch:
- independent reviewer
- dispute arbiter
- multiple workers
- enterprise admin
