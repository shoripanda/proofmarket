# ProofMarket Specifications

更新日: 2026-10-02

このdirectoryはProofMarketの**実装前仕様のsource of truth**。

Claude Code / Codex / OpenClaw等が実装を開始するときは、repository rootの `AGENTS.md` を全文読んだ後、このREADMEと以下の仕様を読むこと。

## Product definition

ProofMarketは汎用gig marketplaceではない。

**AI agentがWeb/APIだけでは確定できない物理世界の事実を、人間のfresh evidenceによって検証し、machine-readableなVerificationResultとして受け取るためのnetwork / API。**

MVPの中心は `PLACE_STATUS_VERIFICATION`。

## Read order

1. `project-brief.md`
2. `problem.md`
3. `users-and-stakeholders.md`
4. `requirements.md`
5. `api-contract.md`
6. `acceptance-criteria.md`
7. `privacy-security.md`
8. `legal-checklist.md`
9. `competitor-differentiation.md`
10. `architecture.md`
11. `onchain-data-model.md`
12. `offchain-data-model.md`
13. `mvp-plan.md`
14. `kpi.md`

## Precedence

仕様が衝突した場合の優先順位:

1. `AGENTS.md` のsecurity / privacy / implementation principles
2. `requirements.md`
3. `acceptance-criteria.md`
4. `api-contract.md`
5. data model / architecture
6. idea / narrative documents

## Implementation freedom

この仕様は**何を満たす必要があるか**を定義する。

以下はClaude Code側で選定してよい。

- frontend framework
- backend framework
- database product
- object storage
- RPC provider
- wallet SDK
- deployment provider
- test framework
- image verification provider/model

ただし、technology choiceによってP0 requirement、privacy/security、legal constraint、acceptance criteriaを弱めてはならない。

## Hard constraints

- raw photo / raw GPS / personal dataをSolanaへ書かない
- workerにSOL保有を強制しない
- secrets / seed phraseをrepositoryへcommitしない
- task create / settleはidempotentにする
- replay / duplicate evidence対策を持つ
- unsafe / illegal / surveillance taskをMVPで受け付けない
- human evidenceをAIでsimulatedしてdemoしない
- mainnet real-money payoutはlegal checklist未解決のまま有効化しない

## Hackathon target

Crypto World's Fair submission deadline: **2026-10-12**。

Submission-readyの意味は `acceptance-criteria.md` に従う。
