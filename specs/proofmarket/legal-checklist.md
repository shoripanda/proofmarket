# Legal / Compliance Checklist

更新日: 2026-10-02

**This is a product checklist, not legal advice.**  
Production launch and real-money mainnet operation require professional review in relevant jurisdictions.

## 1. Japan: freelance / worker classification

Current official guidance states that contractual labels do not alone determine whether a person is legally a worker; actual working conditions matter.

Before production:
- [ ] review applicability of フリーランス・事業者間取引適正化等法
- [ ] review whether task terms must show remuneration, scope, payment timing and other required matters
- [ ] assess worker classification based on actual control/dependence, not “independent contractor” label
- [ ] avoid mandatory availability/exclusivity in MVP
- [ ] preserve accept/decline freedom
- [ ] document cancellation/rejection/payment rules

Primary source:
https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/zaitaku/index_00002.html

## 2. Personal information / location / images

Potentially sensitive operational data:
- worker identity
- precise location
- photos containing identifiable people
- device metadata
- payment/account data

Before production:
- [ ] map each personal data item to purpose
- [ ] publish privacy notice
- [ ] minimize collection
- [ ] set retention/deletion
- [ ] access control for raw evidence
- [ ] handle third-party/bystander data
- [ ] review cross-border storage/transfers
- [ ] incident/breach procedure

Primary source:
https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/

## 3. Payment / stablecoin / crypto regulation

Japan regulates certain activities involving crypto assets and electronic payment instruments/stablecoins. The exact analysis depends on whether ProofMarket merely instructs a user wallet, takes custody, holds escrow, intermediates exchange/transfer, or operates through a registered provider.

Before enabling mainnet real-money operation:
- [ ] classify the asset used
- [ ] determine who has custody/control of funds
- [ ] determine whether platform-held escrow is regulated
- [ ] determine whether payout flow is a regulated money transfer/intermediation activity
- [ ] determine whether stablecoin-related registration/provider partnership is required
- [ ] avoid representing Devnet/test settlement as production legal readiness

Primary sources:
https://www.fsa.go.jp/policy/virtual_currency02/index.html
https://www.fsa.go.jp/common/shinsei/dendai/dentori.html
https://www.fsa.go.jp/common/shinsei/denanchuukai/index.html

## 4. Terms of service

Need:
- [ ] requester terms
- [ ] worker terms
- [ ] acceptable use policy
- [ ] prohibited task policy
- [ ] evidence ownership/license
- [ ] payout/rejection/refund rules
- [ ] liability/indemnity review
- [ ] account suspension
- [ ] dispute process
- [ ] governing law/jurisdiction

## 5. Public photography / property

Before production:
- [ ] define that worker must obey property rules
- [ ] no trespass
- [ ] no restricted-area photography
- [ ] no covert personal surveillance
- [ ] minimize identifiable bystanders
- [ ] handle business requests to remove unlawfully captured material

## 6. Consumer / advertising claims

Do not state:
- “guaranteed true”
- “fraud-proof”
- “impossible to fake”
- “fully decentralized”
unless technically/legal fact supports it.

Use:
- “evidence checks passed”
- “N of M witnesses agreed”
- “evidence hash anchored”
- “settlement confirmed”

## 7. Taxes / worker payout

Before commercial rollout:
- [ ] determine payout reporting obligations
- [ ] determine invoicing/receipt requirements
- [ ] determine platform fee tax treatment
- [ ] determine worker tax information handling

## 8. Geographic launch policy

MVP should be a closed pilot with known jurisdiction and allowlisted task types.

Do not advertise global production coverage before:
- payment
- worker regulation
- privacy
- platform liability
are reviewed by jurisdiction.

## 9. Hackathon-safe default

For hackathon:
- use Devnet/test asset for blockchain demo
- no custody of meaningful real customer funds
- known test workers
- public commercial locations
- explicit participant consent
- no sensitive/regulated task categories
