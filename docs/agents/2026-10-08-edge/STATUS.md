# 進み具合（尖った機能と初心者の導線）

更新は自分の行だけ。main に直接コミットしてよいのはこのファイルだけ。

| 担当 | 状態 | PR | メモ |
|---|---|---|---|
| 本体 | 完了 | #4 | 移行 0023 は本番に適用済み（2026-10-08）。main に入ったので各担当は始められる |
| A 急ぐほど上がる報酬 | 完了（デプロイ待ち） | #5 | 差額は RELEASE 行を足せない（依頼ごと 1 行の制約）ので RESERVE 行を確定額×人数に書き換え、audit `bounty_fixed` に残す。<br>残り（オーナー）: `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml --tools-version v1.57` で v0 の .so を作って devnet へデプロイ（`anchor build` の v3 は使わない）→ Vercel に `RISING_BOUNTY_ENABLED=true`。<br>x402 では `max_amount` を断る（差額の戻し先が無い） |
| B 他のプログラムから読める事実 | 完了 | #7 | 本番で確認済み（2026-10-08）: `/v1/public/verifications/ver_01M42M6WXZ93MFR3YDQZ7JXEHG/onchain` が 200・`Cache-Control: public, max-age=60`、無い依頼は 404。`/r/{id}` と `/en/r/{id}` に PDA・台帳の絵・`<details>` の読み方が出る。`/developers` に On-chain facts の節。<br>core に `RESULT_HASH_FIELDS` を追加（公開の結果は `rejected_submissions` を持たないので、落ちた提出がある依頼は `matches: false` と理由を返す） |
| C 行いの証明・五感の指数 | 完了 | #6 | 依頼の `attestation`（worker 画面に琥珀色の帯、証明ページの見出しは「『…』が本当だと、人が確かめました」）と form の `scale`（丸ボタン 1〜5/1〜10）、3 件以上で `result.aggregate`（中央値は小さい方）。DEV_MODE のブラウザで帯・丸・/r・/en/r を目視済み。<br>`aggregate` は `result_hash` に入るが公開結果には出さない（文章の答えから出す数値のため）。B の `RESULT_HASH_FIELDS` に `aggregate` を足した。公開結果での照合は、集計のある依頼では `matches: false`（理由つき）になる。公開結果での名前は `agent_attestation`（`attestation` はチェーンの記録と重なるため） |
| D worker 側の助け | 完了 | #8 | 「聞く」（依頼詳細・撮影画面）・「話して入力」（文章の答えと form の text 項目、欄に追記）・カメラ上の撮影の案内（条件の最初の 4 行）・合図の音と振動（`pm.sound` で切れる）。Playwright で SpeechRecognition あり／なしの両方を確認。実機は未確認。<br>はまりどころ: 今の Chromium には接頭辞なしの `SpeechRecognition` もある。偽物に差し替えるときは両方の名前を差し替える |
| E 初心者の導線 | 完了 | #11 | トップの「30 秒でわかる」（Kokoro の語り ja jf_alpha 22 秒・en af_heart 20 秒）、ヘッダーの「やさしい言葉」（`pm.plain`、既定オン）、/how-it-works と /workers の絵、worker の初回案内（`pm.tour`）、円の目安（150 円）、/try の読み上げ。本番で 200・切り替えを確認。<br>はまりどころ: misaki の日本語は `JAG2P(version="pyopenjtalk")` を使う（既定は 770MB の unidic が要る）。戻り値は発音記号と高低記号がつながっているので前半だけ渡す。SVG の色を `currentColor` にすると「文字を隠す」確認で絵まで消える。<br>残り: 日本語の声の試聴と実機（iPhone Safari）での再生 |
| F 楽観的な確認 | 作業中 | | worktree ~/proofmarket-f・ブランチ feat/optimistic |
| G 位置の丸め | 完了 | #9 | salt は指示書の `task_id_hash`（公開値）をやめ `HMAC(WORKER_REF_SALT, "location:"+id)` に。公開値だと約 1 km の区画を総当たりして正確な位置が割れる。依頼者は GET の `location_salt` で受け取る。<br>coarse では店名も出さない。指示書の geohash の例 `xn76ur` は東京駅で、35.6595,139.7005 は `xn76fg`。<br>残り: 地図の薄い円はブラウザで未確認 |
