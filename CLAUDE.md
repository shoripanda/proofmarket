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
- 2026-10-02 [LiteSVM 0.10 / Anchor 1.2] `anchor build`（既定 `--arch v3`）の .so を `add_program_from_file` で読む → Agave 3.1 系の LiteSVM が SBPF v3 を読めず `InvalidAccountData` → litesvm を 0.17 に上げる（`--arch v2` なら 0.10 でも通るが、配布物と違う物を試すことになる）
- 2026-10-02 [LiteSVM 0.14] 0.10 から 0.14 に上げる → 依存が `^` 指定のため agave 4.3 系まで解決され、litesvm 自体が wincode の型エラーでコンパイル不可 → 依存を `~` で固定している 0.17 を使う
- 2026-10-02 [Anchor 1.2 / テスト] `anchor_lang::solana_program::instruction::InstructionError` を import → 存在しない → `anchor_lang::solana_program::instruction::error::InstructionError` を使う
- 2026-10-02 [手元 / cargo test] LiteSVM 入りのテストを既定の dev プロファイルでビルド → debuginfo で target/debug が 2GB を超えディスクが尽きる（No space left on device） → `CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0 cargo test -p proofmarket` で約 700MB に収まる
- 2026-10-02 [ローカル検証 / 空き容量] 空き 3.7GB の Mac で solana-test-validator（台帳上限なし）と cargo build-sbf を同時に回す → ENOSPC でディスクが満杯になり、ツール出力すら書けず作業が止まった → 着手前に `df -h` で 8GB 以上あるか確認。バリデータは `--limit-ledger-size 50000000` と scratchpad の台帳で動かし、終わったら台帳を消す。不要な `target/debug` は先に削除
- 2026-10-02 [ローカル検証 / .so] main に PR-09 を取り込んだ後も target/deploy/proofmarket.so が骨組み時代のままで、devnet-setup が `not yet implemented` で panic → ソースを取り込んだら `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml` で .so を作り直してからバリデータに載せる
- 2026-10-03 [cargo build-sbf] 素の `cargo build-sbf` が既定の platform-tools v1.54 を取りに行き、ダウンロードが途中で切れて失敗 → `--tools-version v1.57`（導入済み）を明示する
