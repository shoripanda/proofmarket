# 進み具合（尖った機能と初心者の導線）

更新は自分の行だけ。main に直接コミットしてよいのはこのファイルだけ。

| 担当 | 状態 | PR | メモ |
|---|---|---|---|
| 本体 | 完了 | #4 | 移行 0023 は本番に適用済み（2026-10-08）。main に入ったので各担当は始められる |
| A 急ぐほど上がる報酬 | 完了（デプロイ待ち） | #5 | 差額は RELEASE 行を足せない（依頼ごと 1 行の制約）ので RESERVE 行を確定額×人数に書き換え、audit `bounty_fixed` に残す。<br>残り（オーナー）: `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml --tools-version v1.57` で v0 の .so を作って devnet へデプロイ（`anchor build` の v3 は使わない）→ Vercel に `RISING_BOUNTY_ENABLED=true`。<br>x402 では `max_amount` を断る（差額の戻し先が無い） |
| B 他のプログラムから読める事実 | 完了 | #7 | 本番で確認済み（2026-10-08）: `/v1/public/verifications/ver_01M42M6WXZ93MFR3YDQZ7JXEHG/onchain` が 200・`Cache-Control: public, max-age=60`、無い依頼は 404。`/r/{id}` と `/en/r/{id}` に PDA・台帳の絵・`<details>` の読み方が出る。`/developers` に On-chain facts の節。<br>core に `RESULT_HASH_FIELDS` を追加（公開の結果は `rejected_submissions` を持たないので、落ちた提出がある依頼は `matches: false` と理由を返す） |
| C 行いの証明・五感の指数 | 完了 | #6 | 依頼の `attestation`（worker 画面に琥珀色の帯、証明ページの見出しは「『…』が本当だと、人が確かめました」）と form の `scale`（丸ボタン 1〜5/1〜10）、3 件以上で `result.aggregate`（中央値は小さい方）。DEV_MODE のブラウザで帯・丸・/r・/en/r を目視済み。<br>`aggregate` は `result_hash` に入るが公開結果には出さない（文章の答えから出す数値のため）。B の `RESULT_HASH_FIELDS` に `aggregate` を足した。公開結果での照合は、集計のある依頼では `matches: false`（理由つき）になる。公開結果での名前は `agent_attestation`（`attestation` はチェーンの記録と重なるため） |
| D worker 側の助け | 未着手 | | |
| E 初心者の導線 | 未着手 | | |
| F 楽観的な確認 | 作業中 | | worktree ~/proofmarket-f・ブランチ feat/optimistic |
| G 位置の丸め | 作業中（本体・~/proofmarket-g） | | 21:30 着手。他の画面は G を起動しないでください |
