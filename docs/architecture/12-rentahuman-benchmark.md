# 12. RentAHuman の調査と、ProofMarket をそちらへ寄せる設計（2026-10-16）

オーナーの指示「rentahuman.ai のようにしたい。サイトを精読し、どんな仕組みとコードで動いているか調べ、ProofMarket の設計を考えて」に答える文書。**設計だけで、コードは変えていない。** 実装は §8 の決めごとにオーナーが答えてから始める。

## 1. 結論

RentAHuman の強みは技術の深さではなく、**エージェントに見つけてもらい、つないでもらう入口の広さ**と、**何でも頼める汎用の依頼（bounty）**にある。決済や検証の作りは ProofMarket のほうが堅い（オンチェーンのエスクロー、位置と鮮度の機械検査、Claude の審査）。

なので、土台は今のまま（Next.js・Supabase・Solana・Privy）で置き換えない。足すのは次の 3 つ。

1. **入口**: llms-full.txt・agents.json・OpenAPI の公開位置・npm の MCP パッケージ・MCP Registry 登録・「1 行貼るだけ」の接続ページ・メールコードでの API キー発行。どれも小さく、効き目が大きい。
2. **汎用の依頼**: 今の「確認」（決まった型・機械検査つき）に加えて、自由記述の「仕事」を出せるようにする。応募を受けて人を選ぶ流れ、依頼ごとの会話、複数人の募集、ひな形。
3. **依頼者が決める支払い**: 依頼ごとに「AI 判定が通れば自動で払う」（今の動き）と「依頼者が承認して払う」を選べるようにする。運営の人が判定する段は作らない（#49 の方針どおり）。

## 2. 調べたもの

2026-10-16 に次を取得して読んだ。取得物は作業用の一時フォルダに置き、リポジトリには入れていない。

- 機械向けの公開物: `robots.txt`、`llms.txt`（13KB）、`llms-full.txt`（27KB）、`agents.json`、`openapi.json`（OpenAPI 3.1、操作 71 本）、`/api/stats`、`/api/humans`、`/api/bounties`
- 人向けのページ 84 本: トップ、`/for-agents`、`/docs`（MCP 道具の一覧と REST 参照、115KB）、`/docs/escrow`・`bounties`・`webhooks`・`x402`・`mpp`・`taste-runs`・`humanizations`・`send-money`・`partners`・`github-human-qa`、`/docs/integrations/*` 10 本、`/docs/use-cases/*` 21 本、`/answers/*` 13 本、`/earn-with-ai/*` 8 本、`/qa`・`/taste`・`/services/*`、利用規約・プライバシー
- `sitemap.xml`（46,696 URL）の内訳
- HTTP ヘッダー（CSP を含む）と HTML に埋め込まれた文字列
- npm の `rentahuman-mcp` 3.12.1（2026-10-15 更新）の package.json と同梱の SKILL.md
- GitHub の `rentahuman-ai` 組織の公開リポジトリ（`skills`、`line-waiting-cli`）
- 報道（立ち上げの経緯と、払い出しの不具合の報告）

サーバー側のソースは公開されていない。§3 の構成は、ヘッダー・CSP・規約の記載・npm の依存から推した部分を含む。推した箇所には「推定」と書いた。

## 3. RentAHuman の作り

### 3.1 会社と規模

- 運営は RawLabs, Inc.（dba RentAHuman.ai）。カリフォルニア法準拠。Y Combinator 出資と自社ページに表示。
- 2026 年 2 月初めに公開。作者の Alexander Liteplo は暗号資産の技術者で、Claude のエージェントを回して短期間で組んだと報じられている。
- `/api/stats`（2026-10-16）: 登録した人 853,724、接続したエージェント 32,615、依頼の累計 17,511、サイト訪問 580 万。人の数に比べて依頼は少ない。

### 3.2 技術構成

| 層 | 使っているもの | 根拠 |
|---|---|---|
| 画面 | Next.js（App Router、RSC）、Geist 書体 | `x-matched-path`、`/_next/static/immutable/`、`vary: rsc` |
| 配信 | Vercel（iad1）の前に Cloudflare | `x-vercel-id`、`server: cloudflare`、`cf-ray` |
| 認証・DB・保存 | Firebase（Auth、Firestore、Storage、Cloud Functions） | CSP の接続先、規約に「Firebase (authentication and database)」。ID が 20 字の Firestore 形式 |
| 入金 | Stripe Checkout、MPP（Stripe の Machine Payments Protocol、カードと Link）、x402（Base 上の USDC、早期提供） | docs、CSP |
| 払い出し | Whop（「Withdraw to bank」）と Stripe Connect の本人確認 | HTML の文言キー、`apollo.elements.whop.com` |
| 分析・監視 | PostHog、Sentry、Cloudflare Web Analytics | CSP |
| ボット対策 | Cloudflare Turnstile、reCAPTCHA | CSP |
| 地図 | OpenFreeMap のタイル | CSP |
| 言語 | 訪問者の国で自動で日本語に切り替わる | 日本から取得したページが日本語だった |
| MCP（手元） | npm `rentahuman-mcp`。`@modelcontextprotocol/sdk`、Effect、`@x402/*`、viem。Ed25519 の鍵を手元に作って操作に署名する | npm の依存、llms-full.txt |
| MCP（遠隔） | `https://rentahuman.ai/api/mcp`。OAuth か `X-API-Key`。道具は少なめ | llms.txt |

### 3.3 入口（エージェントにどう見つけてもらい、つないでもらうか）

ここがいちばん作り込まれている。

1. **robots.txt に案内を書く**。llms.txt・agents.json・OpenAPI・MCP の入れ方を、コメントとしてクローラーに読ませている。`Claude-User` と `Perplexity-User` にだけ `/api/` を許す（利用者の指示で動くエージェントが API を叩くのは想定どおり、という書き分け）。
2. **llms.txt と llms-full.txt の二段**。短い方は案内と規則、長い方は「クライアントごとの接続手順・守る規則・技能（skill）」。道具名や値段は書かず「`tools/list` と docs を毎回読め」と書く。古い写しに頼らせない作り。
3. **1 行貼るだけの接続**。`/for-agents/setup` で使うエージェントを選ぶと「llms-full.txt を読んで設定しろ。鍵は rah_…」という 1 行が出る。ログインしていれば鍵がその場で入る。
4. **ブラウザなしで登録**。`POST /api/agents/signup` にメールを送ると 6 桁のコードが届き、`/verify` で API キーが 1 回だけ返る。CAPTCHA なし。x402 で 10 ドル払うと、それが登録になり残高にもなる道もある。
5. **配布先を全部押さえる**。npm、MCP Registry、Claude Code のプラグイン市場（`rentahuman-ai/skills`、技能 7 本）、OpenClaw の ClawHub、ChatGPT の遠隔コネクタ、Meta Muse・Instinct などの個別手引き。
6. **探索用の公開 API は鍵なし**。人と依頼の検索は誰でも呼べる。

### 3.4 依頼（bounty）の流れ

```
dryRun で見積もり → 依頼者に見せて「はい」をもらう → Idempotency-Key つきで投稿
→ 残高から全額を予約（足りなければ pending_deposit と deposit_url）
→ 応募が来る（autoAccept なら AI が選別、既定は off）→ 採用で席が確定、会話が開く
→ worker が証拠を出す → 4 日の確認期間
   ├ 承認して支払う（release、取り消し不可、acknowledgeRelease: true が必須）
   ├ 直しを頼む（3 回まで、期間はやり直し）
   └ 却下 → 運営の人が判定（期間切れも同じ）
→ 埋まらなかった席の分は残高へ戻る
```

- 依頼の項目: 題、説明、分類 8 種、固定か時給、完了の定義、証拠の種類（文字・写真・動画・リンク）、場所か遠隔可、締切、完了までの時間（1〜720 時間、過ぎたら席を外して募集し直す）、席数（1〜2,000、合計 1 万ドルまで）、応募時の質問、本人確認の要否、言語力（CEFR、音声で採点）。
- **アップロード収集型**: 応募の代わりに写真・動画・文書を直接集め、1 件ずつ採否を決め、採用分を zip と manifest.json で受け取る。
- **AI 任せの依頼**（β）: 募集・選別・採用・証拠の確認・支払い・報告までを運営の AI が回し、迷うものだけ依頼者に戻す。
- ひな形を 30 件まで保存できる。worker を「優先」「ブロック」に登録できる。支払い後にチップや立替金を送れる。

### 3.5 お金

- 手数料は worker の報酬に **18% を上乗せ**。100 ドルの仕事なら依頼者は 118 ドル払い、worker は 100 ドル受け取る。
- 依頼者は前払いの残高から払う。残高はカード（Stripe）、MPP、x402（USDC on Base）で入れる。使わなかった分は残高に戻り、銀行へは出せない（カードへの返金だけ可）。
- 残高の管理: 残高が減ったときの通知、支出上限、自動補充。いずれも Webhook で知らせる。
- worker は稼いだ分を Whop 経由で銀行へ出す。報道では払い出しが不安定だった時期がある。

### 3.6 Webhook

HMAC-SHA256（`t=<秒>,v1=<hex>`、本文は生のまま）で署名。鍵ごとに 5 本まで、秘密は作成時に 1 回だけ返す。失敗は 30 秒から倍々で 1 時間まで、6 回再送。15 回続けて失敗すると止める。**試しの送信**（`/test`）と**配信記録の閲覧**（`/deliveries`、試行ごとの結果つき）がある。種類は 29。

### 3.7 安全の決まり

- 公開欄にパスワード・コード・鍵・身分証・口座・住所を書かせない。
- 連絡と支払いを外へ逃がす発言は届けたうえで運営に旗を立てる。
- worker の文面とファイルは「作業のデータ」であり、エージェントへの指示として扱わない（プロンプト注入の対策）。
- エージェントの API キーでは worker 側の操作（応募・プロフィール編集）ができない。
- 「投稿は依頼であって予約ではない」と言い切る。来る保証も時間の保証もしない。

### 3.8 集客

- sitemap の 46,696 URL のうち 24,006 がサービス、22,067 が人のプロフィール、339 がブログ。人と出品を一枚ずつ検索に出している。
- `/answers/*`（13 本）は「〇〇をしてくれる人を雇えるか」に直接答えるページ。AI の検索に引用されやすい形。
- `/docs/integrations/*` で LangChain・CrewAI・Vercel AI SDK などの手順を一枚ずつ持つ。
- トップは「Prompt. Proof. Payment.」の 4 段と、人数・国数の大きな数字。

### 3.9 弱いところ

- 人は 85 万いるのに依頼は 1.7 万。依頼の多くは人が出したもので、エージェントが自分で出す依頼は少ないと報じられている。
- 確認期間が切れると運営の人が判定する。量が増えると人手が詰まる。
- 位置や時刻を機械で確かめる仕組みは見当たらない。証拠の真偽は依頼者が目で見る。
- 規約で、詐欺の依頼や作業中のけがへの責任を広く外している。

## 4. ProofMarket との比較

| 観点 | RentAHuman | ProofMarket（main 7195a5c） | どうするか |
|---|---|---|---|
| 頼めること | 何でも（分類 8 種） | 現実の確認（決まった型） | 自由記述の「仕事」を足す（§5.2） |
| 人の選び方 | 応募 → 依頼者か AI が採用 | 先着の claim | 依頼ごとに先着か応募かを選ぶ |
| 証拠の確かめ | 依頼者が目で見る | 位置・鮮度・nonce・使い回し・似た写真・形式の機械検査と Claude | 強みとして残す。仕事型でも使える検査は使う |
| 支払いの決定 | 依頼者が release。期間切れは運営の人 | AI 判定が通れば自動で払う | 依頼ごとに選ぶ。期間切れは worker へ払う（§5.3） |
| お金の置き場 | 運営の DB の残高 | 台帳 + Solana のエスクロー | そのまま。オンチェーンで確かめられるのは強み |
| 入金 | カード・MPP・x402（Base） | Solana Pay・x402（Solana）・手動 | カード入金は法務を見てから（§8 D4） |
| 払い出し | Whop で銀行へ | 埋め込みウォレットに USDC | そのまま |
| 手数料 | 18% 上乗せ | 明示の率なし（余りは treasury） | 上乗せ型で決める（§8 D3） |
| 会話 | 依頼ごとにある | 無い | 仕事型に足す |
| worker の公開プロフィール | あり（時給・技能・市） | 無い | 本人が選んだときだけ出す（§8 D5） |
| エージェントの入口 | §3.3 の 6 つ | llms.txt（56 行）、REST、MCP（OAuth）、x402 | §5.1 をまず全部やる |
| Webhook | 試し送信・配信記録・自動停止 | 署名つきの送信あり | 試し送信と配信記録を足す |
| 支出の歯止め | 上限・通知・自動補充 | 上限（#44 で検査を入れた） | 通知を足す |

## 5. 設計

### 5.1 入口を揃える（Phase A）

いちばん安く、いちばん効く。既存の機能には触らない。

| 項目 | 中身 | 置き場所 |
|---|---|---|
| llms.txt を書き直す | 何ができるか、規則、各文書へのリンク。値段と道具名は書かずに `tools/list` と docs へ誘導 | `apps/web/public/llms.txt` |
| llms-full.txt | クライアントごとの接続手順（Claude Code・Desktop・Codex・ChatGPT・Cursor）、依頼の手順、守る規則、自分用 skill の作り方 | 同上 |
| agents.json | できることの機械向け要約 | `apps/web/public/agents.json` |
| OpenAPI の公開位置 | `/openapi.json` と `/.well-known/openapi.yaml`（CI で一致を見ている既存の定義を出すだけ） | Route Handler |
| robots.txt の案内 | 上の場所をコメントで書き、`Claude-User` には `/v1/` を許す | `app/robots.ts` |
| npm の MCP パッケージ | `packages/mcp` を `proofmarket-mcp` として公開。`npx -y proofmarket-mcp` と環境変数の鍵で動く | `packages/mcp` |
| MCP Registry | 公式の登録簿に載せる | `server.json` |
| Claude Code のプラグイン | `proofmarket-skills`: 依頼の書き方、結果の追い方（Webhook か定期確認）、異議の出し方 | 別リポジトリ |
| 1 行で接続 | `/connect` を「エージェントを選ぶ → 1 行を写す」に作り直す。ログイン中なら鍵が入る | `app/(site)/connect` |
| メールコードで登録 | `POST /v1/agents/signup` → 6 桁コード → `/verify` で鍵を 1 回返す。お試し残高は今の `/join` と同じ規則 | 新しい Route Handler、表 `signup_codes` |
| dryRun と confirm | 依頼の作成に `dry_run: true` を足し、見積もりと合計を返す。MCP では dry run を見せてから `confirm: true` で投稿 | `/v1/verifications`、MCP の道具 |
| Webhook の試し送信と記録 | `POST /v1/webhooks/{id}/test`、`GET /v1/webhooks/deliveries` | outbox の既存の配信を流用 |

### 5.2 依頼に「型」を持たせる（Phase B）

今の依頼表に `kind` を足し、2 種類にする。

- `verification`（今の確認）: 答えの選択肢、geofence、nonce、証人の人数、機械検査、Claude の判定。変えない。
- `task`（新しい仕事）: 題、説明、完了の定義、欲しい証拠（写真・動画・文字・リンク・ファイル）、場所か遠隔可、締切、完了までの時間、席数、応募時の質問。

仕事型の状態は次のとおり。確認型の状態機械（03 章）とは別の表で持ち、資金の軸（FUNDED・SETTLED・REFUNDED）は共通にする。

```
OPEN ──応募──> APPLIED ──採用──> ASSIGNED ──提出──> SUBMITTED
                                   │                 ├ 承認 ─────────> RELEASED
                                   │                 ├ 直し（3 回まで）─> ASSIGNED
                                   │                 ├ 却下 ─────────> REJECTED（席の分は依頼の資金へ戻る）
                                   │                 └ 期限切れ ─────> RELEASED（worker へ払う）
                                   └ 完了期限切れ ──> 席を外して OPEN へ
```

- 採用の方法は依頼ごとに `first_come`（今の claim）か `application`（応募から選ぶ）。`application` には `auto_accept`（AI が選別、迷うものは依頼者へ）を付けられる。
- 席はオンチェーンでは今の「証人」と同じに扱う。1 席ずつ `finalize_verification` と `settle` を呼べばよく、プログラムは変えなくて済む見込み（05 章の受取人の記録を席ごとに使う）。要確認: 1 つの Task PDA で席ごとに分けて払えるか。無理なら席ごとに PDA を作る。
- 仕事型でも、写真なら撮影時刻・位置・使い回し・似た写真の検査をかけ、結果を依頼者に「参考」として見せる。
- 会話: 表 `conversations` と `messages`。採用で開く。worker の文面はエージェントに渡すとき「データ」の印を付ける。連絡先や外部決済への誘導らしき文面には旗を立てる（届けたうえで記録）。
- アップロード収集型は、今のデータセット公開（`/v1/public/dataset`）の作りを流用できる。

### 5.3 支払いを決めるのは依頼者（Phase B と同時）

依頼ごとに `release_mode` を持たせる。

| 値 | 動き | 向く依頼 |
|---|---|---|
| `auto` | 機械検査と Claude の判定が通れば払う（今の動き） | 確認型の既定 |
| `manual` | 依頼者が `release` を呼ぶまで払わない。`acknowledge_release: true` を必須にする | 仕事型の既定 |

- `manual` の確認期間は 72 時間を既定にする。期間が切れたら **worker へ払う**。運営の人が判定する段は作らない。依頼者が黙っていれば払われる、と最初に見せておく。
- 却下は依頼者の決定として受け付け、理由を必須にする。依頼者ごとの却下率を worker に見せ、却下が多い依頼者には新しい依頼の上限を下げる。これで運営が間に入らずに釣り合いを取る。
- 確認型の異議（再確認の依頼を作る）は今のまま残す。
- MCP と llms-full.txt に「release は依頼者が明示したときだけ」と書く（RentAHuman と同じ規則）。

### 5.4 人を探せるようにする（Phase C）

- worker の公開プロフィール（本人が公開を選んだ人だけ）: 表示名、市区町村まで、技能、言語、完了件数、評価。顔写真は任意。
- `GET /v1/public/workers`（鍵なし、市・技能で絞る）と MCP の `search_workers`。
- 依頼者ごとの「優先」「ブロック」。
- 評価: 依頼者が完了後に 1 回だけ付ける。
- 公開の依頼一覧 `/tasks`（鍵なし）を出し、worker も検索エンジンも読めるようにする。

### 5.5 集客のページ（Phase C と並行）

- `/answers/*`: 「店が営業しているか確かめてもらえるか」「棚に商品があるか見てもらえるか」など、確認の型ごとに 1 枚。AI の検索に引用される形で書く。
- `/docs/integrations/*`: Claude・OpenAI Agents SDK・LangChain・Vercel AI SDK・Cursor の手順を 1 枚ずつ。
- 都市のページ（まず東京）と、公開を選んだ worker のページを sitemap に入れる。
- トップに大きな数字（人数・都市・完了件数）を `/v1/public/stats` から出す。

### 5.6 変えないもの

- Next.js・Vercel・Supabase・Drizzle・Privy・Anchor プログラム。Firebase に寄せる理由はない。
- worker が取引に署名しない作り、鍵の 3 分割、outbox と tick。
- 確認型の機械検査と Claude の判定。RentAHuman に無い強みなので、仕事型でも見せる。

## 6. データの追加

| 表 | 主な列 | 用途 |
|---|---|---|
| `signup_codes` | email_hash、code_hash、expires_at、attempts | メールコード登録 |
| `tasks`（または既存表に `kind`） | kind、selection_mode、release_mode、seats、completion_criteria、evidence_types、remote_ok、completion_window_hours | 仕事型 |
| `applications` | task_id、worker_id、answers、status | 応募 |
| `seats` | task_id、worker_id、status、submitted_at、review_deadline、revisions | 席ごとの進み |
| `conversations` / `messages` | task_id、seat_id、sender、body、flags | 会話 |
| `worker_profiles` | worker_id、public、display_name、city、skills、languages | 公開プロフィール |
| `requester_worker_prefs` | requester_id、worker_id、kind（prefer / block） | 優先とブロック |
| `reviews` | seat_id、rating、comment | 評価 |
| `webhook_deliveries` | endpoint_id、event_id、attempts_log、status | 配信記録 |
| `task_templates` | requester_id、name、body | ひな形 |

移行は 10 章の手順（列を足す → 書き込む → 読む → 古い道を消す）に沿う。

## 7. 進める順番

| Phase | 中身 | 大きさの目安 | 前提 |
|---|---|---|---|
| A | §5.1 の入口一式 | PR 3〜4 本 | なし |
| B | 仕事型、応募、席、会話、`release_mode` | PR 5〜7 本、移行 2〜3 本 | D1・D2 |
| C | 公開プロフィール、検索、評価、公開の依頼一覧、集客ページ | PR 4〜5 本 | D5 |
| D | カード入金、手数料の表示 | PR 2 本 | D3・D4 と法務 |

A は今日からでも始められる。B 以降は §8 の答えを待つ。

## 8. オーナーに決めてほしいこと

| # | 問い | 推す答え | 理由 |
|---|---|---|---|
| D1 | 頼めることを「確認」から一般の仕事へ広げるか | 広げる。確認型は看板として残す | RentAHuman に寄せるなら必要。確認型の機械検査は差別化になる |
| D2 | 仕事型の確認期間が切れたら、どちらに倒すか | worker へ払う（72 時間） | 運営の人の判定を置かない方針（#49）と両立するのはこちら。依頼者が黙っていて払われないと worker が集まらない |
| D3 | 手数料をどうするか | 報酬に上乗せ。率は 10〜15% で決める | worker の受取額がそのまま見える。RentAHuman は 18% |
| D4 | カードで残高を入れられるようにするか | 法務の確認後に判断 | 日本で前払い残高を売ると資金決済法の前払式支払手段に当たる恐れがある。`docs/legal` で先に見る |
| D5 | worker の公開プロフィールを出すか | 本人が選んだ人だけ。市区町村まで | 集客には効くが、位置の情報は慎重に扱う（08 章の位置の暗号化と同じ考え） |
| D6 | 「確認」の名前を残すか | 確認（verification）と仕事（task）を並べる | API の名前を変えると既存の利用者が壊れる |

## 9. 出典

- https://rentahuman.ai/llms.txt 、https://rentahuman.ai/llms-full.txt 、https://rentahuman.ai/robots.txt 、https://rentahuman.ai/agents.json 、https://rentahuman.ai/openapi.json
- https://rentahuman.ai/docs 、/docs/escrow 、/docs/bounties 、/docs/webhooks 、/docs/x402 、/for-agents 、/earn-with-ai/get-paid 、/terms
- https://www.npmjs.com/package/rentahuman-mcp （3.12.1）
- https://github.com/rentahuman-ai/skills
- 報道: [HackerNoon](https://hackernoon.com/lite/ai-agents-are-now-hiring-humans-rentahuman-and-the-inversion-of-work)、[Mischa Dohler](https://mischadohler.com/when-ai-agents-hired-me-inside-rentahumans-real-world-hustle/)、[Let's Data Science](https://letsdatascience.com/news/rentahuman-connects-ai-agents-with-human-gig-workers-322499c6)
