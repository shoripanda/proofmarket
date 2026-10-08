# 13. 尖った機能と、初心者の導線（2026-10-08 設計）

`docs/pitch/07-landscape-and-edge.md` の案 A〜G と「文字に頼らない導線」を、迷わず作れる粒度まで落とした設計書。要件の正本は 01 §4.26（この文書を指す）。実装の順番と、PR ごとの「できた」の判定を末尾に置く。ここに無いことは作らない。

## 0. 決めごと（全体）

- **DB の変更は 1 回**。移行 `0023_edge_features` に、この文書で使う列と表をすべて入れる（§8）。以後の PR は移行を足さない
- **Solana プログラムは 1 回だけ更新**（v1.1、§1）。更新権限は admin 鍵。ほかの機能はプログラムを触らない
- **文字より絵と音**。新しい画面は、見出し 1 行・絵（アイコンかアニメーション）・音声の 3 点で意味が伝わるようにし、説明文は補助に回す（§7）。専門語は「やさしい言葉」に置き換えられる（Solana → 改ざんできない記録、USDC → ドル建てのデジタルマネー、エスクロー → 預かり、MCP → AI の接続口、x402 → その場払い）
- **既存の判定・検査・記録は変えない**。新機能はその前後に足す
- **API の互換**。既存の項目は消さない。新しい項目はすべて任意（省けば今までどおり）

## 1. 急ぐほど上がる報酬（rising bounty）

**依頼**: `bounty` に `max_amount`（任意）と `ramp_minutes`（10〜1440、既定は締切までの時間）を足す。`amount` が開始額、`max_amount` が上限。報酬は作成時刻から直線で上がり、`ramp_minutes` 後に上限に達する。`max_amount` が無ければ従来どおり固定。

**価格の決まり方**: worker の一覧には「今の額」と「上限」を出す。**最初のクレームの時点の額**がその依頼の確定額になり、以後は全員同じ（複数人の依頼でも、人によって額が違う状態は作らない。鎖上の `amount_per_witness` が 1 つのため）。クレームの行に `reward_amount` を記録する。

**資金**: 作成時に `max_amount × 人数` を引き当て、鎖上のエスクローにも `max_amount` で入れる。確定額が決まったら、差額 `(max − 確定) × 人数` を依頼者の残高に戻す。

**プログラム v1.1**: `FinalizeVerificationArgs` に `amount_per_witness: Option<u64>` を足す。指定があれば `≤ task.amount_per_witness` を確かめて `task.amount_per_witness` を書き換え、`settle` はその額で払い、余りは従来どおり treasury（依頼者残高の管理口座）へ戻る。省略なら従来どおり。これ以外は変えない。LiteSVM のテストに「下げて払う」「上げようとして弾く」を足す。デプロイは `anchor build` → `solana program deploy --program-id A9fr…`（admin 鍵）。デプロイが終わるまで `RISING_BOUNTY_ENABLED=false` で API は `max_amount` を 400 で断る。

**API**: `GET` の `bounty` に `max_amount`・`ramp_minutes`・`current_amount`（今の額、確定後は確定額）を返す。worker の一覧と詳細に `reward.current`・`reward.max`・`reward.rises_until` を返す。

**画面**: worker の一覧で、上がっている依頼は額の横に「↑」と小さな上昇の帯。詳細では「今 0.42 → 最大 0.60 USDC（あと 12 分で最大）」。音は付けない。

## 2. 他のプログラムから読める事実（on-chain facts）

鎖上の Task 口座（PDA: `["task", task_id_hash]`、`task_id_hash = SHA-256("proofmarket:task:v1:" + verification_id)`）には既に `outcome`・`evidence_root`・`result_hash`・`recipients`・`finalized_at` がある。足りないのは「読み方」と「突き合わせ方」。

- **SDK**: `verifyOnChain(verificationId, result, rpcUrl)` → PDA を導出して口座を読み、`result_hash(JCS(result から除外項目を抜いたもの))` と比べ、`{ matches, task_account, finalized_at, outcome }` を返す。Anchor の IDL を SDK に同梱せず、口座のバイト列を直接読む（依存を増やさない）
- **公開 API**: `GET /v1/public/verifications/{id}/onchain` → PDA アドレス、`result_hash`、`evidence_root`、`outcome`、`finalized_at`、Explorer の URL、Rust と TypeScript の読み方の断片。認証なし、60 秒キャッシュ
- **証明ページ `/r/{id}`**: 「プログラムから読む」の節。PDA のアドレス、`result_hash` の作り方、`anchor_lang::AccountDeserialize` で読む Rust の 10 行、`@solana/web3.js` で読む TypeScript の 10 行。初心者向けには「この答えは、だれにも書き換えられない台帳に 1 行で残っています」の 1 文と、台帳の絵
- **文書**: `docs/onchain-facts.md`（英）。保険の自動支払いと予約の切り替えの例

## 3. 楽観的な確認（optimistic verification）

**依頼**: `assurance: { level: "optimistic", challenge_minutes: 10〜120 }`。人数は 1、合意 1 として扱い、異議期間を持つ。

**流れ**:

1. 最初の VALID な提出が出た時点で、タスクは `SUBMITTED` のまま `provisional_at` を記録し、結果の仮版を依頼者に返す（`result.provisional: true`、`result.challenge.until`）。Webhook `verification.provisional`
2. 異議期間の間、**API キーを持つ誰でも**（元の依頼者を含む）`POST /v1/verifications/{id}/challenge` を呼べる。保証金は `bounty × 2`（再確認 2 人分）で、呼んだ側の残高から引き当てる。1 件の異議だけ受ける。異議が出ると、異議の種類に関わらず 4.12 節と同じ仕組みで再確認（2 人一致、同じ場所・同じ質問）が作られる。Webhook `verification.challenged`
3. 異議なしで期間が過ぎたら、通常の確定（VERIFYING → VERIFIED → 鎖上に Verified で記録、worker に支払い）
4. 再確認が仮の答えと**一致**したら、異議は `UPHELD`（仮が正しい）。元の依頼は VERIFIED で確定。保証金から再確認の費用を引き、残りを元の worker に上乗せして払う（鎖上の額は変えず、上乗せは依頼者残高の管理口座から worker の次回支払いに足す。§8 の `payout_adjustments`）
5. 再確認が**不一致**なら、異議は `OVERTURNED`。元の依頼は REJECTED（理由 `CHALLENGED`）で確定し、鎖上は `NoConsensus`・受取人は元の worker（検査と照合は通っているので支払う。4.12 節と同じ考え方）。再確認の費用は依頼者の残高から引き、保証金は全額返す。依頼者は再確認の結果（`result.recheck`）を使う

**判定の中身は変えない**。変わるのは「いつ確定するか」と「誰が待ったをかけられるか」。

**初心者への見せ方**: 証明ページでは「1 人が確かめました。30 分のあいだ、だれでも異議を出せました（出ませんでした）」と、砂時計の絵で示す。

## 4. 五感の指数（sense index）

form の項目に `type: "scale"` を足す。`min`・`max`（1〜5 か 1〜10）、`labels`（両端の言葉、例「静か」「うるさい」）。worker の画面は 5 個か 10 個の丸を並べ、言葉は両端だけ。
集計: 同じ依頼の有効な提出が 3 件以上あれば、`result.aggregate[key] = { median, min, max, n }` を返す（判定は文章と同じ扱いのまま。多数決はしない）。
見本: `/developers` に「店の雰囲気を 3 人で測る」依頼文（匂い・騒音・清潔感・明るさの 4 尺度、`assurance: { level: "high" }`）。

## 5. エージェントの行いを人が証明する（attestation）

依頼に `attestation: { subject: "agent_action", description: "..." }`（任意、200 字まで）を付けられる。中身の検査と判定は同じ。変わるのは言葉。

- worker には「確かめる相手: AI エージェントが『〜をした』と言っています。本当かを見てきてください」と出す
- 証明ページは「人が確かめました」ではなく「〜が行われたことを、人が確かめました」の見出し。結果に `attestation` をそのまま返す
- MCP の依頼ツールの説明に、この使い方（配達した・設置した・掃除した）を 1 文足す

## 6. worker 側の助け（ブラウザだけで動く）

API 契約を増やさないため、スマホのブラウザにある機能だけで作る。

- **読み上げ**: 依頼の詳細と撮影画面に「聞く」ボタン。`speechSynthesis` で質問文と受け取りの条件を読む（ja-JP / en-US）
- **声で答える**: 文章の答えの欄に「話す」ボタン。`SpeechRecognition`（対応ブラウザのみ表示）で書き起こし、確認してから送る
- **撮影の案内**: 受け取りの条件があれば、カメラの上にチェック項目として重ねる（条件を「。」で区切って最大 4 行）。種類ごとの `howTo` も同じ場所に
- **音と振動**: 送信できたとき・差し戻されたとき・結果が出たときに、短い音（Web Audio で合成、ファイル無し）と `navigator.vibrate`。設定で切れる

## 7. 初心者の導線（視覚と聴覚）

**サイト**

- トップに「30 秒でわかる」。`FlowDiagram` を大きくして、6 場面に合わせた語り（Kokoro で日英の mp3 を作り `public/audio/` に置く）を再生する。字幕は 1 行だけ。再生ボタンは 1 つ
- 「やさしい言葉」切り替え（ヘッダー）。`<Term>` 部品で専門語を包み、切り替えると上の対応表の言葉に置き換わる。選択は `localStorage` に残す。既定はやさしい言葉**オン**
- `/how-it-works` の各節に絵を 1 枚（SVG の線画。カメラ・検査・2 人の一致・台帳）。文字は見出しと 1 文
- `/workers`（働く人向け）を「3 枚の絵と 3 文」に組み直す。登録 → 近くの依頼 → 撮って答えて受け取る

**worker アプリ**

- 初回だけ 3 画面の案内（絵・1 文・音声）。「近くの依頼を見る」「撮って答える」「報酬を受け取る」。飛ばせる
- 各画面の見出しの横に「聞く」。§6 の読み上げを使う
- 専門語は使わない。USDC の額には円の目安を添える（固定レートの表示、取引はしない）

**/try**

- エージェントの「考え」の吹き出しを `speechSynthesis` で読み上げる切り替え。既定はオフ（自動再生の音は嫌われる）

## 8. 移行 `0023_edge_features`

```
verification_requests
  bounty_max_amount        numeric(20,6)  null   -- §1
  bounty_ramp_minutes      integer        null   -- §1
  bounty_final_amount      numeric(20,6)  null   -- §1 最初のクレームで確定
  challenge_minutes        integer        null   -- §3
  provisional_at           timestamptz    null   -- §3
  attestation              jsonb          null   -- §5 { subject, description }
claims
  reward_amount            numeric(20,6)  null   -- §1 クレーム時点の額
verification_challenges (新規)                   -- §3
  id, verification_id, challenger_credential_id, bond_amount, recheck_verification_id,
  state text (OPEN|UPHELD|OVERTURNED), created_at, resolved_at
payout_adjustments (新規)                        -- §3 の上乗せ
  id, worker_id, verification_id, amount, reason text, created_at, paid_at null
```

RLS は全表で有効（`migrations.test.ts` が確かめる）。

## 9. 作る順番と「できた」の判定

| PR | 中身 | できたの判定 |
|---|---|---|
| 1 | 移行 0023。§1 の API・ledger・worker 表示。プログラム v1.1（build・LiteSVM テスト・devnet へデプロイ）。`RISING_BOUNTY_ENABLED` | 上がる依頼を作り、途中でクレームすると確定額が記録され、差額が残高に戻る。鎖上の settle が確定額で払う |
| 2 | §2 SDK・公開 API・証明ページの節・文書 | `verifyOnChain` が本番の結果で `matches: true`。証明ページに PDA と読み方が出る |
| 3 | §5 attestation、§4 scale と aggregate、見本 | 依頼→worker 画面→証明ページで言葉が変わる。3 人の scale の中央値が返る |
| 4 | §6 読み上げ・声で答える・撮影の案内・音 | iPhone Safari と Android Chrome で動く（手元で確認） |
| 5 | §7 サイトの導線（30 秒・やさしい言葉・絵・/workers）、worker の初回案内、/try の読み上げ | 文字を隠しても流れが追える（スクリーンショットで確認） |
| 6 | §3 楽観的な確認 | 異議なし→確定、異議→再確認→一致で UPHELD、不一致で OVERTURNED。保証金と費用が表どおりに動く |
| 7 | 位置を明かさない位置の証明の**簡易版**: 公開面（証明ページ・地図・データセット）の位置を `location_privacy: "coarse"` で約 1 km（geohash 6 桁）に丸め、正確な位置の SHA-256（塩つき）を証拠バンドルに入れる。ゼロ知識証明は作らない | 公開面に丸めた位置だけが出て、依頼者の GET には正確な位置が出る |

各 PR は `pnpm typecheck`・`biome ci`・web と core のテスト・`next build` を手元で通し、CI が緑ならマージする。PR 1 だけは、移行をユーザーが本番へ当ててからマージする。
