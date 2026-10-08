# 担当 A: 急ぐほど上がる報酬（設計書 §1）

ブランチ: `feat/rising-bounty`。worktree: `~/proofmarket-a`。

## 作るもの

1. **Solana プログラム v1.1**（`programs/proofmarket/`）
   - `FinalizeVerificationArgs` に `amount_per_witness: Option<u64>` を足す。`Some(a)` なら `a > 0 && a <= task.amount_per_witness` を要求し（新しいエラー `AmountIncrease` 等）、`task.amount_per_witness = a` にしてから従来の処理。`None` なら従来どおり
   - `settle` は変えない（`task.amount_per_witness` を使うので自動で確定額で払い、余りは treasury へ）
   - `programs/proofmarket/tests/program_tests.rs` に 2 本足す: 「下げて finalize → settle が下げた額で払い、余りが treasury に戻る」「上げようとすると弾く」
   - 手元の検証は台帳どおり `CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0 cargo test -p proofmarket`。ビルドは `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml --tools-version v1.57`（台帳）。ディスクが 8GB 以上あるか `df -h /System/Volumes/Data` で先に見る
   - IDL が変わるので `anchor build` のあと `packages/solana` の IDL（置き場所は `packages/solana/src` か `idl/` を grep）を更新し、`anchor-adapter.ts` の `finalizeAndSettle` が `amountPerWitness?: bigint` を渡せるようにする（`FinalizeAndSettleInput` に任意の `amountPerWitness` を足す）
   - **devnet へのデプロイ**は最後に、オーナーに `!` で実行してもらう（本番相当の操作のため自分では実行しない）: `solana program deploy target/deploy/proofmarket.so --program-id ~/.config/proofmarket/proofmarket-program-keypair.json -u devnet -k ~/.config/proofmarket/admin.json`。admin は 3.5 SOL。終わったら `solana program show A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s -u devnet` で Data Length が変わったことを確かめる

2. **API と ledger**（`apps/web`）
   - `CreateVerificationRequestSchema.bounty` に `max_amount`（Amount、任意）と `ramp_minutes`（10〜1440、任意。省略時は締切までの分数）を足す。`max_amount < amount` は 400
   - `requester-service.createVerification`: 引き当てと FUND_TASK は `max_amount`（無ければ `amount`）× 人数。`bountyMaxAmount`・`bountyRampMinutes` を保存。環境変数 `RISING_BOUNTY_ENABLED` が真でなければ `max_amount` を `VALIDATION_FAILED`（`reason: "disabled"`）で断る（デプロイ前の安全弁。`apps/web/lib/env.ts` に足す）
   - 「今の額」の関数 `currentBounty(task, now)` を `packages/core/src/domain/money.ts` の隣に置く: `amount + (max − amount) × min(1, 経過分 / ramp)`、6 桁に丸める。確定後（`bountyFinalAmount` あり）はその額
   - `worker-service` のクレーム作成: 最初のクレーム（その依頼の claims が 0 件）のとき `bountyFinalAmount = currentBounty(now)` を保存し、差額 `(max − final) × 人数` を `requester_ledger` に `RELEASE` の行（`entry_type` に既存の種類があれば従う。無ければ `RESERVE_RELEASE` を足し、`startOfSpendDay` の集計から外す）で戻す。クレーム行に `rewardAmount` を記録
   - `settlement-jobs`: `amountPerWitness` に `bountyFinalAmount ?? bountyAmount` を渡す。`totalMicro` も合わせる
   - `views.ts`: `GET` の `bounty` に `max_amount`・`ramp_minutes`・`current_amount` を返す（スキーマに追加）。`worker-service` の一覧・詳細に `reward.current`・`reward.max`・`reward.rises_until`（ISO）
   - 結果の `settlement.paid[].amount` は確定額になる。`buildResult` を確かめる

3. **worker の画面**
   - 一覧（`apps/web/app/(worker)/tasks/page.tsx`）: 上がっている依頼は額の横に「↑」と `max` を小さく。詳細（`tasks/[id]/page.tsx`）: 「今 0.42 → 最大 0.60 USDC（あと 12 分で最大）」。音は付けない

4. **MCP**: `REQUEST_TOOL` の説明に 1 文「bounty.max_amount と ramp_minutes で、受け手が付くまで報酬を上げられる」。

5. **文書**: 05 §2.1 の表に `max_amount`・`ramp_minutes` の検査行を足す。`/developers` の項目表に `bounty.max_amount` の行（日英）。

## テスト
- `apps/web/test/requester-api.test.ts`: `max_amount` 付きで作ると引き当てが `max × n`。`RISING_BOUNTY_ENABLED` が偽なら 400
- `apps/web/test/worker-flow.test.ts` か新規 `rising-bounty.test.ts`: `createTestApp` の時計を進めてクレーム → `bountyFinalAmount` が途中の額、ledger に差額が戻る、2 人目のクレームは同じ額
- `settlement` のテストがあれば `amountPerWitness` が確定額になることを確かめる
- Rust のテスト 2 本

## できたの判定
上がる依頼を作り、途中でクレームすると確定額が記録され、差額が残高に戻る。LiteSVM で settle が確定額で払う。本番の Devnet へのデプロイが済んだら `RISING_BOUNTY_ENABLED=true` を Vercel に入れるのはオーナー（STATUS.md に「デプロイ待ち」と書く）。
