# 担当 C: エージェントの行いの証明（§5）と五感の指数（§4）

ブランチ: `feat/attestation-and-scale`。worktree: `~/proofmarket-c`。移行 0023 の `verification_requests.attestation` を使う。

## 作るもの

### 五感の指数（§4）
1. `packages/core/src/schemas/api.ts` の `FormFieldSchema` に `{ type: "scale", key, label, min: 1, max: 5|10, labels: [低い側, 高い側]（各 20 字）, required }` を足す。`AnswerSchemaSpec` の form はそのまま
2. `packages/core/src/task/answers.ts`: scale は整数で `min..max` に収まること（`normalizeAnswer` の form の分岐に 1 行）。`validateAnswerSchema` で `max` は 5 か 10 だけ
3. `apps/web/lib/answers.ts` の `FormFieldView` と `answerFormat`（「尺度で答える」）。撮影画面（`claims/[id]/capture/page.tsx`）の form の分岐に scale の入力: `max` 個の丸ボタンを横に並べ、両端に `labels`。文字は両端だけ
4. 集計: `apps/web/lib/services/views.ts` の `buildResult` で、form の有効な提出が 3 件以上あれば数値項目と scale 項目ごとに `{ median, min, max, n }` を計算し `result.aggregate[key]` に返す（スキーマ `VerificationResultSchema` に `aggregate` を任意で足す。`result_hash` の除外項目には**入れない**＝ハッシュに含める。`bundle.ts` の `RESULT_HASH_EXCLUDED_FIELDS` は触らない）。中央値は偶数なら小さい方（整数のまま）
5. 見本: `/developers` の `answer_schema` の説明に scale を 1 文、一括依頼の節の次に「店の雰囲気を 3 人で測る」の依頼文（匂い・騒音・清潔感・明るさの 4 尺度、`assurance: { level: "high" }`、`acceptance_criteria` 付き）を日英で

### 行いの証明（§5）
1. `CreateVerificationRequestSchema` に `attestation: { subject: z.literal("agent_action"), description: string 1〜200 }`（任意）。`requester-service` で `attestation` 列に保存。`GET` と worker の一覧・詳細・クレーム詳細に `attestation` を返す（スキーマ追加）
2. worker 画面: 依頼詳細と撮影画面の質問文の上に「確かめる相手: AI エージェントが『{description}』と言っています。本当かを見てきてください」（琥珀色の帯、受け取りの条件と同じ見た目。日英）
3. 証明ページ `/r/[id]`: `attestation` があれば見出しを「{description} が行われたことを、人が確かめました」（英: "A person confirmed that {description} was done"）に。公開結果 `GET /v1/public/verifications/{id}` にも `attestation` を返す（文章は依頼者が書いた物なので公開してよい）。`proof-text.ts` に分岐
4. MCP `REQUEST_TOOL` の説明に 1 文: 「attestation で、自分（エージェント）が行ったことを人に見てもらい証明として受け取れる（配達した・設置した・掃除した）」

## テスト
- `packages/core/test/answers.test.ts` に scale の正常・範囲外・max が 7 の拒否
- `apps/web/test/requester-api.test.ts` に attestation の往復と 201 字の拒否
- `views` の集計: 新規 `apps/web/test/aggregate.test.ts`。3 件の form 提出を DB に直接入れて `buildResult` の `aggregate` を見る（`worker-flow.test.ts` の作り方を参考に）

## できたの判定
依頼→worker 画面→証明ページで言葉が変わる。3 人の scale の中央値が返る。
