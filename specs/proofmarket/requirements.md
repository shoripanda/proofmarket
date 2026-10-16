# Product Requirements

更新日: 2026-10-02

Priority:
- P0 = hackathon submission blocker
- P1 = strongly desired for submission
- P2 = post-hackathon

## 1. Scope

MVP supports one primary task class:

`PLACE_STATUS_VERIFICATION`

The system must support a real AI/API requester and a real human worker.

## 2. Functional requirements

### Requester / Agent

**REQ-A-001 [P0]**  
Requester can create a verification request via REST API.

**REQ-A-002 [P1]**  
Requester can create the same request through MCP.

**REQ-A-003 [P0]**  
Request includes:
- question
- target location
- geofence radius
- deadline
- allowed answer choices
- evidence requirements
- bounty
- witness requirement
- responsible principal reference

**REQ-A-004 [P0]**  
Task creation supports an idempotency key. Repeating the same key must not create a second funded task.

**REQ-A-005 [P0]**  
Requester can retrieve task state and final result by stable ID.

**REQ-A-006 [P0]**  
Requester can cancel an unclaimed/unfunded or otherwise cancellable task under explicit state rules.

**REQ-A-007 [P1]**  
Requester can define `required_witnesses` and `quorum`.

### Worker

**REQ-W-001 [P0]**  
Worker sees eligible open tasks with reward, distance/area, deadline and requirements before accepting.

**REQ-W-002 [P0]**  
Worker explicitly accepts a task. Assignment cannot be silently forced.

**REQ-W-003 [P0]**  
Worker can submit:
- selected answer
- fresh image
- location observation
- task-bound nonce/challenge proof
- client capture timestamp metadata

**REQ-W-004 [P0]**  
Worker can abandon/decline without being forced to continue.

**REQ-W-005 [P1]**  
Worker sees clear rejection reason when automatic validation fails.

### Evidence verification

**REQ-V-001 [P0]**  
System checks submission is for the expected task and worker/claim.

**REQ-V-002 [P0]**  
System checks submission time is within allowed freshness/deadline window.

**REQ-V-003 [P0]**  
System checks submitted location is within configured geofence.

**REQ-V-004 [P0]**  
System prevents exact evidence replay across tasks.

**REQ-V-005 [P0]**  
System validates required image exists and content type/size are allowed.

**REQ-V-006 [P1]**  
System performs duplicate/perceptual similarity check to detect reused images.

**REQ-V-007 [P1]**  
System may run AI vision consistency checks, but stores the check separately from human answer.

**REQ-V-008 [P1]**  
For multi-witness tasks, system computes consensus from valid independent submissions.

**REQ-V-009 [P0]**  
Final result exposes individual validation checks rather than an unexplained confidence score.

### Task lifecycle

P0 state model:

```
CREATED
  -> FUNDED
  -> OPEN
  -> CLAIMED
  -> SUBMITTED
  -> VERIFYING
  -> VERIFIED
  -> SETTLED
```

Allowed terminal/error states:

```
REJECTED
EXPIRED
CANCELLED
REFUNDED
```

P1:
`DISPUTED`

**REQ-S-001 [P0]**  
Invalid state transitions must be rejected.

**REQ-S-002 [P0]**  
Settlement is allowed at most once.

**REQ-S-003 [P0]**  
Expired task cannot accept new evidence.

### Payment / Solana

**REQ-P-001 [P0]**  
Hackathon build must produce at least one verifiable Solana Devnet transaction tied to the task lifecycle: funding, settlement or attestation.

**REQ-P-002 [P0]**  
Raw evidence and precise GPS must not be written on-chain.

**REQ-P-003 [P0]**  
On-chain reference uses a hash/root and pseudonymous identifiers only.

**REQ-P-004 [P0]**  
Payment path must defend against replay/double settlement.

**REQ-P-005 [P1]**  
Worker does not need to manually acquire SOL to complete a task.

**REQ-P-006 [P1]**  
USDC/stablecoin payout path may be implemented after legal/config review; Devnet/test asset is acceptable for hackathon validation.

**REQ-P-007 [P1]**  
Agent-facing paid endpoint may support x402 V2. Do not implement obsolete x402 V1 headers for new work.

### Result

**REQ-R-001 [P0]**  
Final `VerificationResult` contains:
- verification_id
- status
- answer
- witness count
- consensus ratio when applicable
- evidence check results
- evidence root/hash
- timestamps
- settlement/attestation transaction reference when available

**REQ-R-002 [P0]**  
Result must be machine-readable JSON.

**REQ-R-003 [P0]**  
Raw evidence URLs must be access-controlled and separate from public result.

## 3. Safety requirements

**REQ-T-001 [P0]**  
MVP only accepts allowlisted verification categories.

**REQ-T-002 [P0]**  
Reject tasks involving:
- tracking/identifying private individuals
- private residences without authorization
- trespass
- weapons
- illegal drugs/controlled goods
- sexual services/content
- medical/legal/financial professional judgment
- harassment/intimidation
- dangerous physical activity
- evasion of law enforcement or access controls

**REQ-T-003 [P0]**  
Task text is treated as untrusted input and cannot override platform policy/system instructions.

**REQ-T-004 [P0]**  
Every agent credential has spend/task/rate limits.

## 4. Privacy requirements

**REQ-PR-001 [P0]**  
Collect only location precision necessary for the task.

**REQ-PR-002 [P0]**  
Do not expose worker home/base location to requester.

**REQ-PR-003 [P0]**  
Strip or control public exposure of EXIF/personal metadata.

**REQ-PR-004 [P0]**  
Define evidence retention period and deletion behavior.

## 5. Non-functional requirements

**REQ-N-001 [P0]**  
API errors are deterministic and machine-readable.

**REQ-N-002 [P0]**  
Every meaningful state transition creates an audit event.

**REQ-N-003 [P0]**  
Secrets/private keys never appear in repository or client bundle.

**REQ-N-004 [P0]**  
Core workflow has automated tests for valid and invalid transitions.

**REQ-N-005 [P1]**  
Status API is eventually consistent-safe and can be polled without side effects.

**REQ-N-006 [P1]**  
Target pilot availability is sufficient for demo; full production SLA is out of scope.

## 6. Out of scope

- generalized freelancer profiles/résumé marketplace（2026-10-16 改訂: 本人が公開を選んだ worker のプロフィールだけは出す。履歴書型の市場は引き続き対象外。§7）
- bidding/auction engine
- delivery logistics
- purchasing goods
- long-running hourly work
- worker payroll/tax filing automation
- mainnet production release
- tokenomics

## 7. 2026-10-16 改訂: 「確認」と「仕事」を並べる

オーナーの決定（`docs/architecture/12-rentahuman-benchmark.md` §8、D1〜D6）により、頼めることを現実の確認から一般の仕事へ広げる。設計は `docs/architecture/13-marketplace-migration.md`。旗 `tasks_enabled` が off のあいだ、以下は公開しない。

**REQ-T-001 [P2]**  
依頼には `kind` があり、`verification`（今の確認）と `task`（仕事）を並べる。API の名前と既存の入力は変えない（D6）。

**REQ-T-002 [P2]**  
仕事は、題・説明・完了の定義・欲しい証拠・場所か遠隔可・締切・完了までの時間・席の数（1〜50）を持つ。worker の選び方は先着か応募から選ぶかを依頼ごとに決める。

**REQ-T-003 [P2]**  
仕事の支払いは依頼ごとに `auto`（AI 判定で払う）か `manual`（依頼者が承認して払う）を選ぶ。`manual` で提出から 24 時間、依頼者が承認・直しの依頼・却下のどれもしなければ worker へ払う（D2）。運営の人は判定しない。

**REQ-T-004 [P2]**  
却下には理由が要り、その席の報酬と手数料は依頼者の残高へ戻す。依頼者ごとの却下率を worker に見せる。

**REQ-T-005 [P2]**  
手数料は報酬に 15% を上乗せする（D3）。払われた席・証人の分だけを収益にし、払わなかった分は手数料ごと返す。見積もりに内訳を出す。

**REQ-T-006 [P2]**  
入金は Solana の送金と x402 のまま。カードでの入金はしない（D4）。

**REQ-T-007 [P2]**  
worker の公開プロフィールは本人が選んだ人だけ出す。出す位置は市区町村まで（D5）。

**REQ-T-008 [P2]**  
採用した仕事には依頼者と worker の会話がある。連絡先や外部での支払いへの誘導らしき文面は、届けたうえで記録する。worker の文面はエージェントに渡すとき、指示ではなくデータとして扱う。

当面扱わない仕事: 物の購入、物の配送、時給での長時間の作業、資格の要る作業（§4 の Safety policy の禁止事項も仕事型にそのまま当てる）。

