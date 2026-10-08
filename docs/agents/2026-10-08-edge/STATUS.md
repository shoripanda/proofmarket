# 進み具合（尖った機能と初心者の導線）

更新は自分の行だけ。main に直接コミットしてよいのはこのファイルだけ。

| 担当 | 状態 | PR | メモ |
|---|---|---|---|
| 本体 | 完了 | #4 | 移行 0023 は本番に適用済み（2026-10-08）。main に入ったので各担当は始められる |
| A 急ぐほど上がる報酬 | 完了（デプロイ待ち） | #5 | 差額は RELEASE 行を足せない（依頼ごと 1 行の制約）ので RESERVE 行を確定額×人数に書き換え、audit `bounty_fixed` に残す。<br>残り（オーナー）: `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml --tools-version v1.57` で v0 の .so を作って devnet へデプロイ（`anchor build` の v3 は使わない）→ Vercel に `RISING_BOUNTY_ENABLED=true`。<br>x402 では `max_amount` を断る（差額の戻し先が無い） |
| B 他のプログラムから読める事実 | 未着手 | | |
| C 行いの証明・五感の指数 | 作業中 | | worktree ~/proofmarket-c・ブランチ feat/attestation-and-scale |
| D worker 側の助け | 未着手 | | |
| E 初心者の導線 | 未着手 | | |
| F 楽観的な確認 | 未着手 | | |
| G 位置の丸め | 未着手 | | |
