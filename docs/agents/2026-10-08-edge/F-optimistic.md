# 担当 F: 楽観的な確認（設計書 §3）

ブランチ: `feat/optimistic`。worktree: `~/proofmarket-f`。移行 0023 の `challenge_minutes`・`provisional_at`・`verification_challenges`・`payout_adjustments` を使う。プログラムは触らない。設計書 §3 の 1〜5 を**そのまま**実装する。金の流れを変えたくなったら STATUS.md に書いて止まる。

## 作るもの

1. **依頼**: `AssuranceInputSchema` に `{ level: "optimistic", challenge_minutes: 10〜120（既定 30） }` を足す。正規化後は `required_witnesses: 1, quorum: 1, challenge_minutes`。`requester-service` で `challengeMinutes` を保存し、残高の引き当ては `bounty × 1`（保証金は異議を出す側が払う）。`levelOf` は `challenge_minutes` があれば `"optimistic"` を返す
2. **仮の結果**: 最初の VALID な提出で、`task-engine` は `QUORUM_READY` を**発火せず**（`challengeMinutes` が非 null で `provisionalAt` が null のとき）、`provisionalAt = now` を書く。`views.buildVerificationView` は `provisionalAt` があり結果が無いとき `result` に仮版を返す: 中身は `buildResult` と同じ計算を VALID な提出から作り、`provisional: true`、`challenge: { until, state: "open" | "challenged" | "upheld" | "overturned" }` を付ける（スキーマに任意項目を足す。`result_hash` の除外項目に `provisional` と `challenge` を**足す**: `bundle.ts` の `RESULT_HASH_EXCLUDED_FIELDS`）。Webhook `verification.provisional` を `WEBHOOK_EVENTS` に足して送る
3. **異議**: `POST /v1/verifications/{id}/challenge`（requester 認証、Idempotency-Key 必須）。条件: `provisionalAt` から `challengeMinutes` 以内、`verification_challenges` にまだ無い。保証金 `bounty × 2` を呼んだ側の残高から `RESERVE` と同じ仕組みで引き当て（`requester_ledger`、`verification_id` は異議の対象）。`disputeVerification` と同じやり方で再確認（`assurance: standard`、締切 60 分、`recheckOf` に元の ID）を作り、`verification_challenges` に行を入れ、Webhook `verification.challenged`。新規 `apps/web/lib/services/challenge-service.ts`
4. **期間満了**: `jobs.ts` の tick（既存の定期処理）で、`provisionalAt + challengeMinutes < now` かつ異議なしの依頼に `QUORUM_READY` を発火して通常の確定へ
5. **再確認の確定時**（`verification-service` の確定処理の後、`recheckOf` があり元に OPEN の異議があるとき）:
   - 一致（`matches_original`、既存の計算を使う）→ 異議 `UPHELD`。元の依頼に `QUORUM_READY` を発火し VERIFIED へ。保証金から再確認の費用（`bounty × 2`）を引き、残り（0 のときは何もしない）を `payout_adjustments` に元の worker 宛てで記録
   - 不一致 → 異議 `OVERTURNED`。元の依頼を `CONSENSUS_FAILED` 相当で REJECTED にする。理由は新しい `OUTCOME_REASONS` の `CHALLENGED`。鎖上は `NoConsensus`・受取人は元の worker（`settlement-jobs` は既存の REJECTED と同じ道）。再確認の費用は依頼者の残高から引き（`RESERVE`）、保証金は全額戻す
   - `verification_challenges.resolved_at` と `state` を更新
6. **API・MCP・文書**: `GET` の `result.challenge`、`openapi`、MCP の `REQUEST_TOOL` に 1 文（「assurance.level: optimistic で数分で仮の答え、異議期間つき」）と新ツールは**作らない**（異議は REST だけ）。05 §2 に `POST /v1/verifications/{id}/challenge` の節。03 §2 に「仮確定」の段落（状態は増やさず `provisional_at` で表す、と明記）
7. **証明ページ**: `challenge` があれば「1 人が確かめました。{n} 分のあいだ、だれでも異議を出せました（出ませんでした／異議が出て、2 人が確かめ直しました）」と砂時計の線画

## テスト
`apps/web/test/optimistic.test.ts`（`dispute.test.ts` と `worker-flow.test.ts` を手本に）: 異議なし→時計を進めて tick→VERIFIED。異議→再確認→一致→UPHELD と `payout_adjustments`。不一致→OVERTURNED、理由 `CHALLENGED`、保証金が戻る。期間外の異議は 409。

## できたの判定
上の 3 筋がテストで通り、ledger の行が設計書の表どおり。
