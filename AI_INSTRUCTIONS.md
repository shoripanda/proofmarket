# AI_INSTRUCTIONS.md

このリポジトリで作業するAIエージェント向けの共通入口です。

**正本の作業ルールは [`AGENTS.md`](AGENTS.md) です。作業開始前に必ず全文を読んでください。**

その後、以下を順に参照してください。

1. `README.md`
2. `docs/solana-research-2026-09-11.md`
3. `docs/japan-social-issues-2026-09-11.md`
4. `docs/competitive-landscape-and-market-size-2026-09-11.md`
5. 対象となる `ideas/*.md`
6. ProofMarketを扱う場合は `specs/proofmarket/README.md` とそのread order

重要原則:

- blockchain/Solanaの利用自体を目的化しない。
- 既存サービス・通常DBで十分か必ず反証する。
- 事実と仮説を分離する。
- 統計・制度・競合情報には基準日と一次資料URLを残す。
- `MARKET_SIZE` / `INDUSTRY_SCALE` / `PROBLEM_SCALE` / `TRANSACTION_SCALE` / `AID_SCALE` / `ADOPTION` を混同しない。
- 個人情報、医療情報、住所、企業秘密等をpublic chainへ保存しない。
- 実装・調査ルールの詳細は必ず`AGENTS.md`を優先する。


## Current implementation focus — 2026-10-02

Crypto World's Fair向けの主要実装候補は **ProofMarket**。

ProofMarket実装では、汎用agent-to-human marketplaceへscopeを広げず、まず `PLACE_STATUS_VERIFICATION` のend-to-end flowを完成させる。

Definition of Doneは `specs/proofmarket/acceptance-criteria.md`、外部contractは `specs/proofmarket/api-contract.md` を正とする。
