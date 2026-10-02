# ProofMarket Project Brief

更新日: 2026-10-02

## Product thesis

AI agents have software tools, but they do not have reliable eyes in the physical world.

ProofMarket provides a standardized escalation path:

> Ask a real-world question → dispatch a human witness → validate fresh evidence → return a machine-readable answer → settle on Solana.

## Beachhead

### Requester
AI agent developer/operator.

### Worker
Pilot地域内のhuman witness。

### First use case
`PLACE_STATUS_VERIFICATION`

Example:

> Is this shop open right now?

### Why this wedge

- judgeが数十秒で理解できる
- physical-world gapが明確
- answerがbinaryでacceptance判定しやすい
- photo + geofence + freshnessでproof pipelineをdemoできる
- API resultをagent workflowへ戻せる
- Solana settlement / attestationを自然に見せられる

## Value proposition

### Agent side
Web検索の「たぶん」を、fresh human evidence付きの「検証済み」に変える。

### Worker side
近距離・短時間のverification taskを受け、完了条件が明確な形で報酬を得る。

### Platform side
task marketplaceではなく、physical-world verification primitiveを提供する。

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

初期仮説:

- requester pays verification fee + worker bounty
- ProofMarket takes a platform fee
- high-assurance verification uses multiple witnesses and costs more

具体的fee率はMVPで固定しない。実際のworker cost / response time / requester willingness-to-payを測定して決める。

## Main assumptions to validate

1. agent developerがfresh real-world evidenceに支払う
2. API/MCPからtaskを発行するUXに需要がある
3. workerが短時間のverification taskを受ける
4. photo + location + freshness checksで最低限のtrustを作れる
5. multi-witness verificationに追加価値がある
6. Solana settlement/attestationがcentralized payout DBより価値を増す

## Success for hackathon

「platformが完成した」ではなく、以下を示せれば成功。

- actual human verificationが動く
- actual agent/API requestから始まる
- evidence validationが見える
- Solana transaction/attestationが見える
- resultがagentへ戻る
- 少数でもreal user feedbackがある

## Non-goal

“AI replaces humans” narrativeは使わない。

ProofMarketは、softwareが物理世界へアクセスできない境界で、**人間の知覚・存在・行動を明示的に呼び出すhuman-in-the-loop infrastructure**として扱う。
