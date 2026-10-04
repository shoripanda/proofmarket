# 07. 証拠の取得と判定の設計

作成日: 2026-10-02

## 1. 何を確かめ、何を確かめられないか

判定は「その写真が、そのタスクのために、その場所の近くで、nonce 発行の後に撮られて送られた」ことの状況証拠を積み上げるもので、物理的にそこにいたことの証明ではない（`privacy-security.md` 2 節）。

| 確かめられる | 確かめられない |
|---|---|
| 写真が nonce 発行から一定時間内にサーバーへ届いた | 写真がその時刻に撮られたこと（端末の時刻は偽れる） |
| 端末が報告した位置がジオフェンスの中 | 位置が偽装されていないこと（ブラウザの Geolocation API では偽装を検出できない） |
| 同じ写真ファイルが過去に使われていない | 別の端末の画面を撮り直した写真でないこと |
| 似た写真が別のタスクや別の worker から来ていない（P1） | 複数の worker の共謀 |

確かめられない側の弱さは、複数 witness（P1）と worker の招待制で補う。ピッチや画面で「偽造できない」とは書かない（`legal-checklist.md` 6 節）。

## 2. 撮影の流れ（クライアント）

```text
W-04 タスク詳細 ──「引き受ける」──▶ POST claim
W-05 移動中   ──「現地に着いた」──▶ 位置の許可を確認
W-06 撮影画面
  1. POST /claims/{id}/challenge で nonce を受け取る（画面に残り時間を表示）
  2. getUserMedia({ video: { facingMode: "environment" } }) でライブ映像を出す
  3. 撮影ボタンで映像の 1 フレームを canvas に描き、JPEG（品質 0.85、長辺 1920px 以内）にする
  4. 同時に navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  5. 回答（OPEN / CLOSED / UNCLEAR）を選ぶ
  6. POST /claims/{id}/uploads → 署名 URL に PUT
  7. POST /tasks/{id}/evidence（Idempotency-Key は upload_id から作る）
W-07 判定結果
```

写真はアプリ内のカメラでしか撮れず、端末のギャラリーから選ぶ導線を作らない。`getUserMedia` が使えない端末だけ `<input type="file" accept="image/jpeg" capture="environment">` に切り替え、その提出には `risk_flags` に `fallback_capture` を付ける。

canvas から JPEG を作るので、元の写真の EXIF はそもそも乗らない。それでもサーバー側で再エンコードする（3 節）。

撮影画面には「店頭・看板・営業時間の掲示を写す」「人の顔が大きく写らないようにする」「店内や敷地の立入禁止区域に入らない」を常に表示する（`privacy-security.md` 3〜4 節）。

## 3. サーバーの処理順

提出 API（05 章 3.6）の前段検査を通った後、次の順で判定する。最初に落ちた判定で止めて残りを `not_run` にする（REQ-X-V-101）。写真の読み込みとハッシュ計算はどの提出でも必ず行い、その写真を replay の比較対象に加える（01 章 4.7）。そのため media と replay を先に置き、時間と位置の判定はその後にする。

| 順 | check_type | 合格条件 | 不合格の reason_code | やり直し |
|---|---|---|---|---|
| 0 | `claim_binding` | クレームが本人の ACTIVE で、タスクと一致（前段で確認済みのものを記録） | — | — |
| 0 | `task_window` | DB の `now()` < deadline、タスクが受付中 | — | — |
| 0 | `task_nonce` | nonce がこのクレームの ISSUED と一致し未使用（前段で確認済みのものを記録。時間切れは `freshness` で見る） | — | — |
| 0 | `answer_schema` | 回答が選択肢に含まれる（前段で確認済み） | — | — |
| 1 | `media_schema` | 先頭バイトが JPEG、サイズ ≤ 8 MiB、sharp で復号でき、短辺 ≥ 480px | `MEDIA_TYPE_UNSUPPORTED` / `MEDIA_TOO_LARGE` / `MEDIA_DECODE_FAILED` | 可 |
| 2 | `replay` | 元ファイルの SHA-256 が `evidence_objects` に存在しない（実際には `evidence_objects` への挿入が一意制約で失敗するかどうかで判定する） | `EVIDENCE_REPLAYED` | 不可（クレームを REJECTED） |
| 3 | `freshness` | `now() − challenge.issued_at ≤ freshness_max_age_s`、かつ Storage のオブジェクト作成時刻 ≥ `challenge.issued_at` | `EVIDENCE_STALE` | 可 |
| 4 | `geofence` | `accuracy_m ≤ 100`、かつ目標地点との距離（haversine）≤ `radius_m` | `LOCATION_ACCURACY_TOO_LOW` / `EVIDENCE_OUTSIDE_GEOFENCE` | 可 |
| 5 | `duplicate`（P1） | 過去 90 日の他の提出と dHash のハミング距離 > 6 | `EVIDENCE_NEAR_DUPLICATE` | 不可（クレームを REJECTED） |
| 6 | `vision_consistency`（01 章 4.16 節） | 1〜5 がすべて通った後、Claude が写真と答えを依頼文と突き合わせる。`pass` は合格、`uncertain` と判定できなかった場合は `warning` で合格、`fail` は不合格 | `EVIDENCE_MISMATCH` | 可 |

補足:

- 端末の時刻とサーバー時刻が 120 秒以上ずれていたら、`freshness` は合否を変えずに `machine_details.client_clock_skew_s` を記録し、`risk_flags` に `clock_skew` を付ける
- 距離 + 精度が半径を超える（中心は中にあるが誤差円がはみ出す）場合は合格のまま `risk_flags` に `edge_of_geofence` を付ける
- 判定 2 は DB の一意制約そのもの（04 章 3.10）。同時に同じファイルが 2 件来ても、片方は挿入で失敗して `EVIDENCE_REPLAYED` になる
- 判定 5 は同じクレーム内の以前の試行を比較対象から外す。同じ店を撮り直せば似た写真になるのは自然なため
- `vision_consistency` では、依頼文・答え・画像に写った文字をすべて信頼できない入力として扱う。プロンプトで区切って渡し、その中の指示には従わないよう明示する。モデルの出力は構造化出力で `verdict`・`reason`・`observed` の 3 項目に限る。2026-10-04 に、この判定を合否に使うよう改めた（01 章 4.16 節。旧 REQ-V-007 の「合否に使わない」を置き換える）

### 3.1 画像の保存

1. 署名 URL で `evidence-raw` に置かれた元ファイルを読む
2. SHA-256 を元ファイルのバイト列で計算する（判定 4 と evidence バンドルで使う）
3. sharp で回転を補正して EXIF・ICC・XMP を落とし、長辺 1280px の JPEG を作って `evidence-derived` に置く
4. dHash（9×8 グレースケールの差分ハッシュ、64 ビット）を派生画像から計算する
5. 元ファイルの EXIF は暗号化して `raw_metadata_enc` に入れ、30 日で消す

画像の処理は Vercel 関数内で行う。復号できない、または 40 メガピクセルを超える画像は sharp に渡す前に断る（`limitInputPixels`）。

## 4. 合意の算出

```ts
// packages/core/src/verification/consensus.ts
type Outcome =
  | { kind: "VERIFIED"; answer: string; ratio: number }
  | { kind: "REJECTED"; reason: "NO_CONSENSUS"; ratio: number }
  | { kind: "EXPIRED"; reason: "INSUFFICIENT_WITNESSES" };

function decide(valid: { answer: string }[], quorum: number): Outcome {
  if (valid.length < quorum) return { kind: "EXPIRED", reason: "INSUFFICIENT_WITNESSES" };
  const counts = countBy(valid, (s) => s.answer);
  const max = Math.max(...Object.values(counts));
  const top = Object.keys(counts).filter((a) => counts[a] === max);
  const ratio = max / valid.length;
  if (max >= quorum && top.length === 1) return { kind: "VERIFIED", answer: top[0], ratio };
  return { kind: "REJECTED", reason: "NO_CONSENSUS", ratio };
}
```

呼ぶ時点は 03 章の T07・T08・T11・T12。`consensus_ratio` は最多回答の件数 ÷ valid の件数で、ほかの数字（信頼度など）は作らない。

支払いの受取人は valid な提出をした全員（01 章 4.2）。valid は最大 `required_witnesses` 件なので、オンチェーンの受取人上限 5 を超えない。

## 5. evidence root と result hash

### 5.1 evidence バンドル

```json
{
  "schema": "proofmarket.evidence-bundle.v1",
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "task_id_hash": "sha256:...",
  "type": "PLACE_STATUS_VERIFICATION",
  "question_hash": "sha256:...",
  "answer_values": ["CLOSED", "OPEN", "UNCLEAR"],
  "assurance": { "required_witnesses": 1, "quorum": 1 },
  "submissions": [
    {
      "witness_ref": "hmac:...",
      "answer": "OPEN",
      "evidence_sha256": ["sha256:..."],
      "server_received_at": "2026-10-09T03:14:29Z",
      "checks": { "freshness": "pass", "geofence": "pass", "media_schema": "pass", "replay": "pass", "task_nonce": "pass" }
    }
  ],
  "outcome": "VERIFIED",
  "final_answer": "OPEN",
  "finalized_at": "2026-10-09T03:14:31Z"
}
```

- `submissions` には valid な提出だけを入れ、`server_received_at` の昇順、同時刻なら `evidence_sha256` の昇順に並べる
- 配列 `answer_values` は辞書順に並べる
- `witness_ref` は `HMAC-SHA256(WORKER_REF_SALT, worker_id + ":" + verification_id)`。タスクごとに値が変わるので、バンドルを並べても同じ worker を結び付けられない。運営者は DB の対応から追える
- 座標・写真・質問文そのものは入れない

### 5.2 計算

```text
evidence_root = SHA-256( JCS(evidence_bundle) )          // JCS = RFC 8785
result_hash   = SHA-256( JCS(VerificationResult から result_hash・consensus_ratio・attestation・settlement・verified_at を除いたもの) )
```

`consensus_ratio` は浮動小数で、DB の `numeric` との往復で値が変わりうるため入力から外す（`answer_counts` から誰でも計算できる）。`finalized_at` はアプリが 1 回だけ決め、バンドルと DB に同じ値を入れる。

npm の `canonicalize`（RFC 8785 実装）を使い、自前で実装しない。表記は API では `sha256:<hex>`、オンチェーンでは 32 バイトの生値。

同じ入力から常に同じ root が出ることを、固定のバンドルと期待値の組で単体テストする（`onchain-data-model.md` 5 節）。Stretch の公開検証 API（REQ-X-R-102）は、このバンドルを返して第三者に計算し直してもらうためのものである。

## 6. worker に見せる理由文

| reason_code | 表示（日本語） |
|---|---|
| `EVIDENCE_STALE` | 撮影の受付時間（{n} 分）を過ぎました。もう一度「撮影を始める」を押してください。 |
| `LOCATION_ACCURACY_TOO_LOW` | 位置の精度が足りません（誤差 {a} m）。屋外の空が見える場所で、少し待ってから撮り直してください。 |
| `EVIDENCE_OUTSIDE_GEOFENCE` | 店舗から {d} m 離れた位置で撮影されています。{r} m 以内に近づいて撮り直してください。 |
| `MEDIA_DECODE_FAILED` | 写真を読み込めませんでした。撮り直してください。 |
| `EVIDENCE_REPLAYED` | 以前に使われた写真と同じファイルです。このタスクは終了しました。 |
| `EVIDENCE_NEAR_DUPLICATE` | ほかの提出とほぼ同じ写真です。このタスクは終了しました。 |
| `NONCE_EXPIRED` | 撮影の受付時間を過ぎました。もう一度「撮影を始める」を押してください。 |

文言の英語版は P1 で足す。
