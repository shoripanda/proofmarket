# KPI Framework

更新日: 2026-10-02

## North-star metric

**Accepted real-world verifications returned to an agent within requested SLA.**

This counts only:
- actual human observation
- required checks passed
- final machine-readable result produced

Do not count simulated tasks.

## 1. Demand

### Verification requests
Number of real requests from non-demo workflows.

### Distinct requesters
Unique agent developers/operators.

### Repeat requester rate
% of requesters who create another verification after first completion.

### Willingness to pay
Requested/accepted price points and explicit interview feedback.

## 2. Supply

### Eligible workers
Workers able to receive task in pilot geography.

### Claim rate
claimed / opened tasks

### Completion rate
valid submissions / claimed tasks

### Worker repeat rate
workers completing >1 task

## 3. Marketplace liquidity

### Time to claim
task open → worker claim

### Time to verified result
task open → VERIFIED

### Claim-to-submit time
worker claim → submission

### Expiry rate
expired / opened

These are more informative than total signup count.

## 4. Verification quality

### Evidence validation pass rate

### Replay rejection test pass rate

### Quorum agreement rate
For multi-witness tasks.

### Disagreement rate
Useful signal; do not hide it.

### False acceptance / false rejection
Requires labeled test cases and later production review.

Do not invent a “98% accurate” claim without measured ground truth.

## 5. Cost

### Worker payout per verification

### Platform verification cost
storage + model/check + RPC + payment fees

### Total cost per accepted verification

### Cost by assurance level
1 witness vs quorum.

## 6. Agent utility

Measure:
- % of results successfully parsed
- % causing automated next action
- integration time
- API error rate
- developer qualitative feedback

## 7. Solana-specific

- successful settlement/attestation transactions
- failed/retried transactions
- duplicate settlement prevented
- confirmation latency observed
- transaction cost observed

These prove technical operation, not product demand.

## 8. Hackathon targets

Targets are goals, not current achievements.

Minimum useful evidence by submission:
- 5+ real completed verifications
- 2+ distinct human workers if available
- 2+ distinct requester workflows/users if available
- at least 1 rejected invalid/replay test shown
- at least 1 explorer-visible Devnet task transaction
- measured median end-to-end time
- documented user feedback and iteration

Stretch:
- 20+ completed verifications
- 3+ external agent developers
- working quorum
- repeat requester

## 9. Metrics not to overemphasize

- X impressions
- GitHub stars
- raw page views
- waitlist signups without usage
- number of hypothetical cities

They may support distribution evidence but are not core product validation.
