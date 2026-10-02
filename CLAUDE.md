# CLAUDE.md

Claude Codeでこのリポジトリを扱う場合、**[`AGENTS.md`](AGENTS.md) をこのリポジトリの正本ルールとして必ず読んで従ってください。**

あわせて、作業開始前に次を確認してください。

1. `README.md`
2. `docs/solana-research-2026-09-11.md`
3. `docs/japan-social-issues-2026-09-11.md`
4. `docs/competitive-landscape-and-market-size-2026-09-11.md`
5. 対象の `ideas/*.md`
6. ProofMarketを実装する場合は `specs/proofmarket/README.md` を開き、記載されたread orderに従って仕様一式を読む

このファイルと`AGENTS.md`で内容が衝突する場合は、`AGENTS.md`を優先します。


## ProofMarket implementation rule

ProofMarketではコードを書き始める前に、最低限以下を確認する。

- `specs/proofmarket/requirements.md`
- `specs/proofmarket/api-contract.md`
- `specs/proofmarket/privacy-security.md`
- `specs/proofmarket/acceptance-criteria.md`

Technology stackはClaude Code側で選定してよいが、P0 requirementsやsecurity/privacy constraintを変更する場合は、先に仕様文書側へ理由と変更を反映する。
