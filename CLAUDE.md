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


## 失敗ルート台帳

- 2026-10-02 [Anchor 1.2 / anchor-spl] `features = ["token", "associated_token"]` だけで `token::mint` / `token::authority` 制約を使う → derive が `anchor_spl::token_interface` を参照してコンパイルエラー → `token_2022` feature も有効にする
- 2026-10-02 [Anchor 1.2 / IDL] 命令引数の構造体に `Option<(Pubkey, Pubkey)>` などのタプル型を入れる → IDL build が `Unsupported type` で失敗 → タプルをやめて別々のフィールドにする
- 2026-10-02 [TypeScript 5.9 / monorepo] `import "./x.ts"` の形で書く → TS5097 → `allowImportingTsExtensions: true`（`noEmit` と併用）を tsconfig.base.json に入れる
- 2026-10-02 [pnpm 12] 依存の postinstall（esbuild 等）が自動で止められる → `pnpm-workspace.yaml` の `allowBuilds` で許可（不要なものは false）
- 2026-10-02 [CI / gitleaks-action@v2] ワークフロー全体を `permissions: contents: read` にして PR で実行 → PR のコミット一覧 API が 403 で失敗 → secrets ジョブに `pull-requests: read` を足す
