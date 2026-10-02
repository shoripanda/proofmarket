# 03. 状態遷移設計

作成日: 2026-10-02

## 1. 状態を 3 軸に分ける理由

既存の `requirements.md` はタスクの状態を一本の列で書いているが、複数 witness のタスクではクレームと提出が並行して進み、「CLAIMED か SUBMITTED か」を一つに決められない。また RPC 障害時の `VERIFIED_PENDING_SETTLEMENT`（`architecture.md` 4 節）は、検証の結果と資金の状態が別々に動くことを示している。

そこで状態を次のように分ける。

| 軸 | 持つ場所 | 値 | 外部への見せ方 |
|---|---|---|---|
| ライフサイクル | `verification_requests.status` | `requirements.md` の状態名をそのまま使う | API の `status` |
| 資金 | `verification_requests.funding_status`、`settlement_status` | 下の 4 節 | API の `funding.status`、`settlement.status` |
| 結果 | `verification_results.outcome` | `VERIFIED`、`REJECTED`、`EXPIRED` | `VerificationResult.status` |

`api-contract.md` 7 節の例で `status: "VERIFIED"` と `settlement.status: "SETTLED"` が同時に出ているのは、この分け方と一致する。

個々の進み具合は、タスクの下のクレーム・提出・チャレンジがそれぞれの状態で持つ。

## 2. タスクのライフサイクル

### 2.1 状態の意味

CLAIMED・SUBMITTED・VERIFYING は「そこまで進んだことがある」を表し、後戻りしない。枠が空いているかどうかは状態ではなく `open_slots` で判断する。

| 状態 | 意味 | worker に見えるか |
|---|---|---|
| CREATED | 検査を通って作成済み。資金拘束待ち | いいえ |
| FUNDED | 資金拘束の取引が確定した（直後に OPEN へ進む一時的な状態） | いいえ |
| OPEN | 受付中。まだ誰も引き受けていない | はい |
| CLAIMED | 1 件以上のクレームが作られた。枠が空いていれば受付を続ける | 空き枠があれば |
| SUBMITTED | 1 件以上の提出があった。枠が空いていれば受付を続ける | 空き枠があれば |
| VERIFYING | 合意の算出中（同じトランザクション内で終わる短い状態） | いいえ |
| VERIFIED | 合意に達した | いいえ |
| SETTLED | VERIFIED の後、支払いの取引が確定した | いいえ |
| REJECTED | 合意に至らなかった（`NO_CONSENSUS`） | いいえ |
| EXPIRED | deadline までに valid が quorum に届かなかった | いいえ |
| CANCELLED | requester がキャンセルした、または資金拘束に失敗した | いいえ |
| REFUNDED | 拘束した資金を全額返した | いいえ |
| DISPUTED | P1。今回は実装しない | — |

空き枠は次の式で求める。

```text
open_slots = required_witnesses − (valid な提出数) − (ACTIVE なクレーム数)
```

### 2.2 遷移表

表にない (状態, イベント) の組み合わせはすべて拒否する（REQ-S-001）。

| # | 遷移元 | イベント | 条件 | 遷移先 | 副作用 |
|---|---|---|---|---|---|
| T01 | CREATED | `FUNDING_CONFIRMED` | initialize_task が finalized | FUNDED | funding_status = CONFIRMED |
| T02 | FUNDED | `OPEN` | deadline > now | OPEN | Webhook `verification.open` |
| T03 | OPEN | `CLAIM_CREATED` | open_slots > 0、claims_enabled フラグが真 | CLAIMED | クレーム作成、Webhook `verification.claimed` |
| T04 | CLAIMED / SUBMITTED | `CLAIM_CREATED` | 同上 | （変わらない） | クレーム作成 |
| T05 | CLAIMED | `SUBMISSION_RECEIVED` | クレームが ACTIVE、deadline 前 | SUBMITTED | Webhook `verification.submitted` |
| T06 | SUBMITTED | `SUBMISSION_RECEIVED` | 同上 | （変わらない） | — |
| T07 | SUBMITTED | `QUORUM_READY` | valid 数 = required_witnesses | VERIFYING | 合意算出を同じトランザクションで実行 |
| T08 | OPEN / CLAIMED / SUBMITTED | `DEADLINE_REACHED` | valid 数 ≥ quorum | VERIFYING | ACTIVE なクレームを EXPIRED に。合意算出 |
| T09 | VERIFYING | `CONSENSUS_REACHED` | 最多回答の件数 ≥ quorum で、最多が一つ | VERIFIED | 結果を保存、settlement_status = PENDING、FINALIZE_AND_SETTLE を outbox へ、Webhook `verification.verified` |
| T10 | VERIFYING | `CONSENSUS_FAILED` | T09 の条件を満たさない | REJECTED | 結果を保存（`NO_CONSENSUS`）、settlement_status = PENDING、FINALIZE_AND_SETTLE を outbox へ、Webhook `verification.rejected` |
| T11 | OPEN / CLAIMED / SUBMITTED | `DEADLINE_REACHED` | 1 ≤ valid 数 < quorum | EXPIRED | 結果を保存（`INSUFFICIENT_WITNESSES`）、ACTIVE なクレームを EXPIRED に、FINALIZE_AND_SETTLE を outbox へ、Webhook `verification.expired` |
| T12 | FUNDED / OPEN / CLAIMED / SUBMITTED | `DEADLINE_REACHED` | valid 数 = 0 | EXPIRED | 結果を保存（`INSUFFICIENT_WITNESSES`、valid 0 件）、ACTIVE なクレームを EXPIRED に、REFUND_TASK を outbox へ、Webhook `verification.expired` |
| T13 | VERIFIED | `SETTLEMENT_CONFIRMED` | settle が finalized | SETTLED | settlement_status = CONFIRMED、Webhook `verification.settled` |
| T14 | CREATED | `CANCEL_REQUESTED` | 資金拘束の取引をまだ送っていない | CANCELLED | 残高の引き当てを戻す、FUND_TASK ジョブを取り消す |
| T15 | OPEN / CLAIMED / SUBMITTED | `CANCEL_REQUESTED` | ACTIVE なクレーム 0 件、valid 0 件 | CANCELLED | REFUND_TASK を outbox へ |
| T16 | CREATED | `FUNDING_FAILED` | 再試行の上限に達した、または deadline を過ぎた。かつ Task PDA がオンチェーンに無く、送った全署名の blockhash が失効済み（もう着地しえない） | CANCELLED | 残高の引き当てを戻す、理由 `FUNDING_FAILED`、Webhook `verification.cancelled` |
| T17 | CANCELLED / EXPIRED | `REFUND_CONFIRMED` | refund が finalized | REFUNDED | 残高を戻す、settlement_status = CONFIRMED |
| T18 | REJECTED / EXPIRED | `SETTLEMENT_CONFIRMED` | settle が finalized（valid が 1 件以上） | （変わらない） | 残額を戻す、settlement_status = CONFIRMED。`verification.settled` は送らない（成功と誤読させないため） |

T16 の条件を確かめる途中で Task PDA が見つかった場合は、資金拘束は成功していたので T01 に進む。deadline を過ぎていれば続けて T12 で返金する。こうして「CANCELLED にしたのにオンチェーンでは資金が拘束されたまま」という状態を作らない。

REJECTED と、valid が 1 件以上ある EXPIRED では、valid な worker への支払いと残額の返却を settle 1 回で行う（06 章）。このときライフサイクルは REJECTED / EXPIRED のまま変えず、資金の完了は `settlement_status = CONFIRMED` で示す。SETTLED は「合意に達して支払いまで終わった」場合だけに使い、エージェントが `status` だけを見ても成功と失敗を取り違えないようにする。

CREATED で資金拘束の取引を送信中にキャンセルが来た場合は、T14 を使わず確定を待ってから T15 で扱う。応答は `409 TASK_NOT_CANCELLABLE`（`retryable: true`）とする。

### 2.3 最終的に落ち着く状態

| 結末 | ライフサイクル | settlement_status | result.status |
|---|---|---|---|
| 合意して支払い済み | SETTLED | CONFIRMED | VERIFIED |
| 合意したが支払い待ち | VERIFIED | PENDING / SUBMITTED / FAILED | VERIFIED |
| 合意できず、valid な人には支払い済み | REJECTED | CONFIRMED | REJECTED |
| 期限切れ、valid な人には支払い済み | EXPIRED | CONFIRMED | EXPIRED |
| 期限切れ、提出なし、返金済み | REFUNDED | CONFIRMED | EXPIRED |
| 資金拘束後にキャンセル、返金済み | REFUNDED | CONFIRMED | （なし） |
| 資金拘束前にキャンセル | CANCELLED | NONE | （なし） |

## 3. タスクの下の状態

### 3.1 クレーム

| 状態 | 意味 |
|---|---|
| ACTIVE | 引き受け中。チャレンジの取得と提出ができる |
| ACCEPTED | valid な提出があった（終端） |
| REJECTED | 試行回数を使い切った、または replay で打ち切られた（終端） |
| ABANDONED | worker がやめた（終端） |
| EXPIRED | クレームの有効期間か deadline が過ぎた（終端） |

| 遷移元 | イベント | 遷移先 |
|---|---|---|
| ACTIVE | 提出が VALID | ACCEPTED |
| ACTIVE | 提出が INVALID、やり直せる理由、試行回数が残っている | ACTIVE |
| ACTIVE | 提出が INVALID、理由が replay か near-duplicate、または試行回数を使い切った | REJECTED |
| ACTIVE | worker が放棄 | ABANDONED |
| ACTIVE | 有効期間切れ、またはタスクが VERIFYING 以降に進んだ | EXPIRED |

ACCEPTED 以外の終端に移ると枠が 1 つ空く。

### 3.2 提出

判定はリクエストの中で同期的に行うので、CHECKING は外から見えない。

| 状態 | 意味 |
|---|---|
| CHECKING | 判定中 |
| VALID | すべての必須判定を通った。合意の計算に入る |
| INVALID | いずれかの必須判定に落ちた。理由コードを持つ |

1 つのクレームで CHECKING の提出は同時に 1 件までとする（部分一意インデックスで保証。04 章）。

### 3.3 チャレンジ（nonce）

| 状態 | 意味 |
|---|---|
| ISSUED | 発行済み、未使用 |
| USED | 提出で使われた |
| SUPERSEDED | 同じクレームで新しいチャレンジが発行された |
| EXPIRED | 有効期間を過ぎた |

1 つのクレームで ISSUED のチャレンジは常に 1 件まで。

### 3.4 アップロード

| 状態 | 意味 |
|---|---|
| PENDING | 署名つきアップロード URL を発行した |
| FINALIZED | 提出に紐づいた |
| DISCARDED | 使われないまま 1 時間たった。オブジェクトも消す |

## 4. 資金の状態

### 4.1 funding_status

```text
NONE → PENDING（ジョブ登録）→ SUBMITTED（署名あり）→ CONFIRMED
                               └→ FAILED（再試行待ち）→ SUBMITTED …
                               └→ ABANDONED（T14・T16）
```

### 4.2 settlement_status

```text
NONE → PENDING → SUBMITTED → CONFIRMED
                   └→ FAILED（再試行待ち）→ SUBMITTED …
```

settlement は支払い（settle）と返金（refund）のどちらか一方しか起きない。どちらになるかは `payment_records.kind` に残す。

### 4.3 オンチェーンの状態との対応

オンチェーンの状態は最小限にしている（06 章）。`onchain-data-model.md` 3 節の候補との対応は次のとおり。

| オンチェーン | 意味 | オフチェーンの対応 |
|---|---|---|
| `Funded` | 資金を拘束した | FUNDED〜VERIFYING、および確定前の VERIFIED / REJECTED / EXPIRED |
| `Finalized` | 結果（outcome・evidence root・受取人）を書き込んだ | settle 待ち |
| `Settled` | 支払いと残額返却を終えた | SETTLED、または REJECTED / EXPIRED + CONFIRMED |
| `Refunded` | 全額を返した | REFUNDED |

`onchain-data-model.md` が挙げる OPEN・CANCELLED・EXPIRED はオンチェーンに持たない。これらは誰がいつ引き受けたかに関わる状態で、公開チェーンで検証する利点がないためである。

## 5. 実装上の約束

- 遷移表は `packages/core/src/task/transitions.ts` に 1 つのデータとして書き、`transition(state, event, context)` が遷移先と副作用の一覧、またはエラーを返す
- サービス層は副作用の一覧を見て、状態の更新・audit_events・outbox_jobs・Webhook を同じトランザクションで書く
- 単体テストは全 (状態, イベント) の組み合わせを回し、表にある組み合わせだけが成功することを確かめる（REQ-N-004）
- audit_events の `event_type` は `architecture.md` 7 節の名前を使い、`before_state` と `after_state` を必ず埋める
