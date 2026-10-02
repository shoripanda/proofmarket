# 09. テスト計画

作成日: 2026-10-02

## 1. テストの層

| 層 | 対象 | 道具 | CI で回すか |
|---|---|---|---|
| U: 単体 | `packages/core`（状態遷移、判定、合意、正規化、ポリシー、エラー形式） | Vitest | はい |
| P: プログラム | `programs/proofmarket` の全命令と不変条件 | LiteSVM（Rust） | はい |
| I: 結合 | API → DB → Storage → Settlement Adapter → ローカルの検証器 | Vitest、Docker の PostgreSQL、`solana-test-validator`、Storage はテスト用 bucket | はい（validator 起動込み） |
| E: 画面の通し | worker の登録から提出まで | Playwright（モバイル表示、位置とカメラは偽装） | P1 |
| F: 現地 | 実在の worker、実在の店舗、Devnet | 手順書と記録表 | いいえ |
| R: デモ通し | 提出用のデモ手順 | ストップウォッチ | いいえ |

E 層の偽装した位置とカメラはテストのためだけに使う。デモや実利用の証拠として見せる成功例は F 層の本物に限る（`acceptance-criteria.md` A2「no synthetic/AI-generated evidence」）。

## 2. 必須の否定テスト

`acceptance-criteria.md` D 節の 10 項目と、テストの対応。

| # | 内容 | テスト ID | 層 | 期待する結果 |
|---|---|---|---|---|
| D1 | 同じ Idempotency-Key で 2 回作成 | I-IDEM-01、I-IDEM-03 | I | 2 回目は同じ応答と `Idempotent-Replayed: true`。依頼と残高引き当ては 1 つ（I-IDEM-01、PR-04）。Task PDA も 1 つ（I-IDEM-03、PR-11） |
| D1' | 同じキーで本文を変えて作成 | I-IDEM-02 | I | 409 `IDEMPOTENCY_KEY_CONFLICT` |
| D2 | 同じ写真を別のタスクに提出 | I-EVD-01 | I | 2 件目が `EVIDENCE_REPLAYED`、クレームは REJECTED |
| D3 | 期限切れの nonce | I-EVD-02a、I-EVD-02b | I | アップロード URL の取得時なら 410 `NONCE_EXPIRED`（提出は記録されない）。URL 取得後に期限が切れて提出したら `EVIDENCE_STALE` で INVALID |
| D3' | 使用済みの nonce | I-EVD-03 | I | 409 `NONCE_USED` |
| D4 | ジオフェンスの外 | U-CHK-03、I-EVD-04 | U / I | `EVIDENCE_OUTSIDE_GEOFENCE`、やり直し可 |
| D5 | 期限切れのタスク | I-EVD-05 | I | 410 `TASK_EXPIRED` |
| D6 | 対応しないファイル | I-EVD-06 | I | PNG・テキスト・壊れた JPEG で `MEDIA_TYPE_UNSUPPORTED` / `MEDIA_DECODE_FAILED`、9 MiB で `MEDIA_TOO_LARGE` |
| D7 | 禁止された依頼内容 | U-POL-01〜13、I-CRT-05・06 | U / I | 規則ごとに 422 `TASK_POLICY_VIOLATION` と `rule_id`。許可リスト外の位置は 400 `LOCATION_NOT_ALLOWLISTED` |
| D8 | settle を 2 回 | P-SET-02、I-SET-02 | P / I | 2 回目は `InvalidStatus`。Adapter は状態を読んで送らない |
| D9 | settle の後に refund | P-REF-03、I-SET-03 | P / I | オンチェーンは `InvalidStatus`。DB は `settle_xor_refund` で REFUND の行を作れない |
| D10 | refund の後に settle | P-SET-04、I-SET-04 | P / I | 同上（逆向き） |

## 3. 層ごとの主なテスト

### 3.1 単体（U）

- U-SM-ALL: 全 (状態, イベント) の組み合わせで、03 章の遷移表にあるものだけが成功する（REQ-S-001、REQ-N-004）
- U-SM-CAN: キャンセルの条件（ACTIVE なクレームや valid がある場合の拒否）
- U-CHK-01〜08: 判定ごとの境界値（距離 = 半径ちょうど、精度 100m ちょうど、鮮度ちょうど、ファイルサイズちょうど）
- U-CON-01〜08: 合意（1/1、2/2 一致、2/3 一致、2/3 割れ、UNCLEAR の多数、同数、valid が quorum 未満）
- U-JCS-01: 固定のバンドルから固定の evidence root が出る。キーの順番を入れ替えても同じ
- U-JCS-02: result hash の入力に `result_hash`・`consensus_ratio`・`attestation`・`settlement`・`verified_at` が含まれない。API の応答から計算し直すと同じ値になる
- U-POL-01〜13: 08 章 3 節の規則ごとに、日本語と英語の禁止例が断られ、近いが問題のない例（「営業中ですか」など）が通る
- U-ERR-01: すべてのエラーコードが `code`・`message`・`retryable` を持ち、スタックトレースを含まない（REQ-N-001）

### 3.2 プログラム（P）

| ID | 内容 |
|---|---|
| P-INIT-01 | 正常に拘束され、vault の残高が `amount × N` |
| P-INIT-02 | 同じ `task_id_hash` で 2 回目が失敗 |
| P-INIT-03 | 許可されていない mint、0 円、N=0、Q>N、過去の deadline、`paused`、operator 以外の署名でそれぞれ失敗 |
| P-FIN-01 | 正常に確定 |
| P-FIN-02 | verifier 以外の署名、Funded 以外、受取人の重複・超過・不足、全 0 の root でそれぞれ失敗 |
| P-FIN-03 | deadline を大きく過ぎてからでも Funded なら確定できる（D-11） |
| P-CFG-01 | `update_config` で `max_witnesses` を 6 以上にすると失敗 |
| P-SET-01 | 正常に支払い、残額が treasury に戻り、vault が閉じる |
| P-SET-02 | 2 回目の settle が失敗 |
| P-SET-03 | 受取人の口座の順番違い・別 mint・別の所有者で失敗 |
| P-SET-04 | Refunded の後の settle が失敗 |
| P-REF-01 | キャンセル扱いの返金が成功 |
| P-REF-02 | deadline 前の期限切れ返金が失敗 |
| P-REF-03 | Finalized・Settled の後の refund が失敗 |
| P-OVF-01 | `amount × N` があふれる値で失敗 |

### 3.3 結合（I）

- I-FLOW-01: 作成 → 資金拘束 → クレーム → チャレンジ → アップロード → 提出 → VERIFIED → SETTLED が通り、Devnet 相当の取引署名が結果に入る
- I-FLOW-02: 2-of-2（P1）で一致して VERIFIED、2 人に支払い
- I-FLOW-03: 2-of-2（P1）で割れて REJECTED、2 人に支払い、ライフサイクルは REJECTED のまま
- I-FLOW-04: 誰も来ずに EXPIRED → REFUNDED、残高が戻る
- I-RACE-01: 残り 1 枠に 2 人が同時にクレームし、1 人だけ成功する
- I-RACE-02: 1-of-1 に 2 件の提出が同時に届いても valid は 1 件
- I-RPC-01: RPC を止めた状態で VERIFIED になり、settlement が PENDING → 復旧後に SETTLED。止めている間に SETTLED と表示しない
- I-RPC-02: 送信後の確認前にプロセスが落ちても、再実行で二重に支払わない
- I-LIM-01: 1 件上限・日次上限・残高不足・レート制限
- I-RACE-03: 残高ぎりぎりの API キーから 10 件を同時に作成し、引き当ての合計が残高を超えない
- I-CRT-05: 禁止語を含む依頼が API で 422 になり、依頼も引き当ても作られない
- I-CRT-06: 許可リストの地点から 31 m 離れた位置の依頼が 400 `LOCATION_NOT_ALLOWLISTED`
- I-IDEM-03: 同じ依頼の FUND_TASK を 2 回実行しても Task PDA は 1 つで、2 回目は送信しない
- I-FUND-01: 資金拘束の確認がタイムアウトした後に取引が着地していた場合、T16 で CANCELLED にせず T01 に進む
- I-SET-02: FINALIZE_AND_SETTLE を 2 回実行しても 2 回目は送信しない
- I-SET-03・04: プログラムを使わずに（非常時の構成を想定して）支払いの後の返金、返金の後の支払いを DB に記録しようとすると、一意制約で失敗する
- I-SET-05: オンチェーンで Finalized の受取人が DB と違うとき、settle を送らずにジョブを DEAD にする
- I-OUT-01: RUNNING のまま落ちたジョブが、リースの期限後に tick で再実行される
- I-PRIV-01: requester と公開 API の応答に、座標・worker ID・公開鍵・写真の URL が含まれない（REQ-PR-002、A4）
- I-WH-01（P1）: Webhook の署名が検証でき、送信先が落ちても決済の状態が変わらない

## 4. CI

`.github/workflows/ci.yml` で PR ごとに次を回す。どれかが落ちたらマージしない。

1. `pnpm lint`、`pnpm typecheck`
2. `pnpm test`（U 層）
3. `anchor build` と `cargo test`（P 層）
4. 結合テスト（PostgreSQL と `solana-test-validator` をサービスとして起動）
5. `gitleaks detect`（履歴も含む）
6. `pnpm build` 後、`.next/static` に鍵らしき文字列（base58 で 87〜88 文字、`pm_test_`、`sk-`）がないことを確認

## 5. 現地テスト（F 層）

### 5.1 手順

1. 運営者がパイロット地域の公開店舗を 3〜5 か所選び、店舗名・位置・半径（既定 80m）を記録する
2. デモ用エージェントで依頼を作る（requester 役は worker と別の人）
3. worker が自分のスマートフォンで引き受け、現地で撮影・提出する
4. 結果、Explorer の取引、所要時間を記録表に書く

### 5.2 記録表の列

`日時`、`verification_id`、`店舗（運営者の内部メモ）`、`requester`、`worker`、`作成→クレーム（分）`、`クレーム→提出（分）`、`提出→SETTLED（秒）`、`回答`、`実際の状態（目視）`、`判定の不合格理由`、`Explorer`、`気づいたこと`

`kpi.md` の数字（中央値の所要時間、却下理由の内訳など）はこの表から出し、手で盛らない。

### 5.3 わざと失敗させる回

- 店舗から 200m 離れて撮る（ジオフェンス外）
- nonce を取ってから 6 分待つ（アップロード時の `NONCE_EXPIRED`）。写真をアップロードしてから 5 分待って送信する（`EVIDENCE_STALE`）
- 同じ写真を別のタスクで使う（replay。テスト用ファイルを使い、この回の結果は実利用の件数に数えない）

## 6. 受け入れ基準の対応表

| 基準 | 確認方法 |
|---|---|
| A1 requester フロー | I-FLOW-01、I-IDEM-01・03、F 層 |
| A2 人間のフロー | F 層（実在の人と写真）。E 層の偽装は成功例に数えない |
| A3 判定 | D2〜D6 のテスト、I-FLOW-01 |
| A4 結果 | I-FLOW-01 の JSON 検査、I-PRIV-01 |
| A5 Solana | P 層全部、I-RPC-01・02、I-SET-02〜05、Explorer で目視 |
| A6 セキュリティ | CI の 5・6、U-SM-ALL、I-LIM-01、I-RACE-03、D7、D6 |
| A7 デモ | R 層。3 分以内、DB を手で触らない、Explorer のリンクが開く |
| B（P1） | I-FLOW-02・03、MCP の手動確認、I-WH-01、F 層 5 件以上 |
