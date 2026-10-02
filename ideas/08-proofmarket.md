# ProofMarket — AIのためのReality Verification Network

更新日: 2026-10-02  
Status: **2026年秋 Crypto World's Fair向け主要実装候補**

## 1. 一言でいうと

**AIエージェントが、WebやAPIでは確定できない現実世界の事実を、人間に検証依頼し、証拠付き・機械可読な結果を受け取れるネットワーク。**

汎用的な「AIが人間を雇うマーケットプレイス」そのものを目的にしない。最初のwedgeは **real-world fact verification** に限定する。

仮キャッチコピー:

> Give AI eyes in the real world.

## 2. Problem

AIエージェントはWeb、API、database、browserにはアクセスできるが、次のような「今この場所で実際にどうなっているか」は直接確認できない。

- 店舗が今、本当に営業しているか
- 店頭に特定商品が存在するか
- 現在掲示されている価格はいくらか
- 現地掲示・設備・看板が存在するか
- Web情報と現場の状態が一致しているか

検索結果、口コミ、営業時間DBは古い場合があり、AIが誤った前提で次の行動を取る可能性がある。

## 3. Narrow initial user

最初のrequesterは、**物理世界の最新事実を必要とするAI agent developer / operator**。

MVPでは「一般消費者」「全企業」ではなく、以下のような開発者を想定する。

- travel / local search agent
- shopping / retail research agent
- field verificationを必要とするoperations agent
- autonomous research agent

Human worker側は、pilot対象地域にいる少数のtest workerから開始する。

## 4. 最初のtask type

MVPでは自由記述の何でも屋にしない。

### P0 task: PLACE_STATUS_VERIFICATION

例:

> 指定店舗が現在営業中か確認せよ。

必須入力:

- question
- target location
- geofence radius
- deadline
- answer choices
- required evidence
- bounty
- witness count / quorum

必須提出:

- answer
- fresh photo
- device/server timestamp
- location proof
- one-time task nonceとの紐付け

### P1 task

- PRICE_VERIFICATION
- PRODUCT_PRESENCE
- SIGNAGE_VERIFICATION

主観評価、購入代行、配送、対人交渉、危険作業はMVP対象外。

## 5. User flow

```text
AI Agent
   ↓ REST / MCP
Verification Request
   ↓
ProofMarket
   ↓
Human Worker
   ↓
Fresh evidence + answer
   ↓
Verification checks
   ↓
Consensus / acceptance
   ↓
Solana settlement + attestation receipt
   ↓
Machine-readable result
   ↓
AI Agent continues workflow
```

## 6. Outputの考え方

AIへ返す主成果物は「人間の作業物」ではなく **VerificationResult**。

例:

```json
{
  "verification_id": "ver_...",
  "status": "verified",
  "answer": "OPEN",
  "consensus_ratio": 1.0,
  "witnesses": 3,
  "evidence_checks": {
    "geofence": true,
    "freshness": true,
    "nonce": true,
    "duplicate": false
  },
  "evidence_root": "...",
  "settlement_signature": "..."
}
```

calibratedされていない「AI confidence 98%」のような数字はMVPでは使わない。代わりに、観測可能な `consensus_ratio` と個別check結果を返す。

## 7. 競合との違い

2026-10-02時点で、agent-to-human市場にはTaskin、RentAHuman、NeedaHuman、Human4Hire等が存在する。

ProofMarketは以下に絞る。

1. 汎用task marketplaceではなく **fact verification protocol**
2. input/output schemaをverification向けに標準化
3. workerの自由文成果物ではなくmachine-readable result
4. 必要に応じ複数witnessによるquorum
5. raw evidenceではなくevidence hash/rootをSolanaへanchor
6. request → proof → settlementまでagentがAPI/MCPで完結

競合が同様の機能を追加する可能性は高い。差別化は名称ではなく、verification quality、latency、coverage、worker reputation、agent integration、costで実証する必要がある。

## 8. Why blockchain

通常DBだけでもtask matchingとevidence storageは実装できる。

Solanaを使う仮説は以下に限定する。

- agentがprogrammaticにUSDC等でbountyをfundできる
- acceptance条件後のsettlementを第三者検証可能にする
- evidence本文を公開せずhash/rootのみをtimestamp付きでanchorする
- requester / worker / verifierをまたぐsettlement receiptを共通化する
- agentic payment toolingとcomposableに接続する

上記価値がPoCで確認できなければ、on-chain範囲を縮小する。

## 9. Why Solana

- micro-payment / high-frequency settlementに適した低cost
- fast confirmationを前提にagent workflowへ組み込みやすい
- stablecoin payment ecosystem
- x402 / MPP等agentic paymentとの公式documentationがある
- public verifiabilityを持つsettlement / attestation layerとして利用可能

x402は「人間タスク全体のescrow」と同義ではない。agentによるAPI payment/fundingと、worker bounty settlementは別レイヤーとして設計してよい。

## 10. Hackathon MVP

最低限、実在する人間を使って次をend-to-endで動かす。

1. AI agentがverification requestを作成
2. taskがworker画面に表示
3. workerがaccept
4. 現地でfresh photo + location + answerをsubmit
5. serverがevidence checks
6. VerificationResult生成
7. Solana Devnet上でsettlementまたはattestation
8. agentがmachine-readable resultを取得

**simulated human resultは禁止。**

Stretch:

- 2-of-3 quorum
- MCP integration
- x402 payment-gated request
- worker reputation
- live explorer

## 11. Non-goals

MVPでは以下を行わない。

- 汎用gig marketplace
- 配送 / 購入 / 代理交渉
- 医療・法律・金融判断
- 個人追跡 / surveillance
- 私有地への立入りを要するtask
- weapon / drug / controlled goods関連
- token発行
- DAO governance
- raw GPS / photoのon-chain保存
- fully autonomous dispute arbitration

## 12. Mandatory Gate

### Problem
物理世界のfresh stateをagentが直接取得できない問題は実在する。ただしProofMarket固有の支払意思はuser interviewで未検証。

### Existing alternatives
Taskin / RentAHuman / NeedaHuman / Human4Hireが近い。従って「AIが人間を雇える」だけでは差別化にならない。

### Why now
AI agent tool useとmachine payment infrastructureが拡大し、physical-world escalation pathが製品カテゴリとして現れ始めている。

### Founder-market fit
現時点では「AI agent / automationを日常的に構築している」という側面を中心に説明する。誇張しない。user interviewと実運用で補強する。

### Distribution
最初はagent developerにREST/MCPを提供し、worker側は1地域のclosed pilotで供給を作る。

### Hackathon feasibility
task typeを1つに限定すればworking MVPは短期で可能。

## 13. 主要リスク

- 既存競合が近い
- worker supplyのcold start
- GPS spoof / stale photo / replay
- requesterによる危険・違法task
- worker collusion
- payout / escrowの法規制
- worker classification / freelance regulation
- privacy / location data
- verification costがbountyを上回る
- quorum化によるlatency増大

## 14. Source of truth

実装時は `specs/proofmarket/README.md` を入口とし、特に以下を優先する。

- `requirements.md`
- `api-contract.md`
- `privacy-security.md`
- `acceptance-criteria.md`

## Sources

- Solana Agentic Payments: https://solana.com/docs/payments/agentic-payments
- Solana x402: https://solana.com/docs/payments/agentic-payments/x402
- Taskin: https://trytaskin.ai/
- Taskin docs: https://trytaskin.ai/docs
- RentAHuman: https://rentahuman.ai/for-agents
- NeedaHuman: https://needahuman.ai/
- Human4Hire: https://www.human4hire.ai/
- Colosseum Crypto World's Fair: https://colosseum.com/worldsfair
