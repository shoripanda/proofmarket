# Surfpool で決済アダプタを通す試験（2026-10-15）

`docs/architecture/` 11 章の作業 1-c。Solana Foundation の kit/nextjs テンプレートがテストに使う `@solana/surfpool`（プロセス内で動く Solana の実行環境、Rust 製のネイティブアドオン）で、ProofMarket の配置用バイナリと決済アダプタが動くかを確かめた。

## 結論

動く。`target/deploy/proofmarket.so`（SBPF v0、`cargo build-sbf --tools-version v1.57` で作った Devnet 配置用の実物）を Surfnet に載せ、`initialize_config` → `initialize_task` → `finalize_verification` + `settle` → `initialize_task` → `refund` を本物の `createSettlementAdapter` 経由で流したところ、起動から停止まで 330 ミリ秒で全部通った。`solana-test-validator` を手で立てて `devnet-setup` を流し、起動直後の不安定さ（CLAUDE.md の台帳 2026-10-11）を避けながら回していた localnet テストの代わりに使える。

| 段 | 経過（ms） | 結果 |
|---|---|---|
| Surfnet 起動（offline、slot 400 ms） | 40 | `http://127.0.0.1:<動的ポート>` |
| `.so` の配置（`surf.deploy({ programId, soPath })`） | 46 | 宣言どおりの program id に載る |
| mint 作成・treasury に 100 入金 | 175 | spl-token の通常の手順 |
| `initialize_config` | 189 | Anchor の `Program` から |
| `assertSafeToStart` | 196 | genesis と Config の照合 |
| `fundTask` | 223 | Funded |
| `finalizeAndSettle`（受取人 1） | 276 | Settled、`paid_total` 500000、証人の ATA に 0.5 |
| `fundTask` → `refund(Cancelled)` | 327 | Refunded |

## 方法

- `@solana/surfpool` 1.6.1（2026-10-11 公開）を scratchpad に `npm i` し、`Surfnet.startWithConfig({ offline: true, slotTimeMs: 400 })` で起動した。`offline` を付けないとメインネットの口座を遠隔から取りに行く
- スクリプトはリポジトリの `scripts/` に一時的に置いて `pnpm --filter @proofmarket/scripts run run <file>` で走らせた（`@proofmarket/solana` と `@anchor-lang/core` の解決にワークスペースが要る）。scratchpad から直接 `tsx` で走らせると依存が見つからない
- 鍵は全部その場で作った使い捨て。Devnet にも `~/.config/proofmarket/` にも触れていない

## 注意

- **確定が即時**。Surfnet は送った取引をその場で finalized にするので、メインネットの確定待ち（約 7 秒、16 §2.3）や再送の挙動は測れない。処理量の計測（11 章 5-a、5-b）には使えず、プログラムとアダプタの論理の検査に使う
- **ポートが動的**。`packages/solana/test/localnet.test.ts` は `http://127.0.0.1:8899` を決め打ちしているので、Surfpool に載せ替えるときは RPC の URL をテストが受け取る形に変える
- `.so` は手元の `target/deploy/` に要る。CI で使うなら `cargo build-sbf`（platform-tools v1.57）の段が先に要り、Rust の toolchain を入れた job になる
- ネイティブアドオンなので `pnpm-workspace.yaml` の `allowBuilds` に加える判断が要る（台帳 2026-10-02）。今回は scratchpad の npm で入れた

## 次にすること（11 章 5-b に積む）

1. `packages/solana/test/surfpool.test.ts` を足し、今回のスクリプトの流れ（config → fund → settle → refund、USDT 相当と PYUSD 相当の mint を含む）を vitest の中で回す。`PM_LOCALNET` の手順はそのまま残す
2. CI の `program` job で `cargo build-sbf` のあとにこのテストを流すか、`.so` を成果物として渡すかを決める
3. 処理量の目標（16 §7.1）は Surfpool では測れないので、メインネット移行後の実測（`tick_runs`、`/v1/health/ready` の `last_tick`）で見る
