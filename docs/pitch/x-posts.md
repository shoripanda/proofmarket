# X の投稿文（10/5〜10/12、10本）

作成: 2026-10-04
各回に2つ: 創業者の個人アカウント用（日本語）と、プロジェクトのアカウント用（英語）。

## 決まり（`docs/colosseum-hackathon-playbook-2026-09-16.md` §10）

- リンクは最初の投稿に入れず、自分の返信に置く。下の「返信」がそれ
- 画像か動画を必ず付ける
- ハッシュタグは付けない。付けるなら1つまで（例: #Solana）
- @ の付け先は、その投稿に本当に関係する相手だけにする（Colosseum の公式アカウントなど）。青い字を増やさない
- 個人のアカウントは考えたことと気づき、プロジェクトのアカウントは出したものと進み具合
- 数字は投稿の直前に `/stats` から写す。【】のまま投稿しない
- 「初の」「唯一の」「革新的」とは書かない。他社を名指しで下げない
- 本番の URL: https://proofmarket-rosy.vercel.app

## 前提が付いている投稿

| 回 | 前提 | 満たされないとき |
|---|---|---|
| 2 | A（x402）が本番に入っている | 3 と入れ替える |
| 4・9 | C（`/stats`）が本番に入っている | 数字を本文から外し、画面の写真だけにする |
| 6 | B（写真を最大4枚）が本番に入っている | 7 と入れ替える |

---

## 1. 10/5（月）ProofMarket を紹介する

**個人（日本語）**

> AI エージェントは人に作業を頼めるようになりました。でも、届いた写真と答えが本当に頼んだとおりか、エージェント自身には確かめられません。
>
> そこを埋めるものを作っています。人の作業の結果を、頼んだ AI が信用できる形で返す仕組みです。Colosseum に出します。

**プロジェクト（英語）**

> Agents can hire people now. They still can't tell whether the work they get back is what they asked for.
>
> ProofMarket returns the result of human work in a form the requesting agent can trust. Every submission is checked, and the result and payment are recorded on Solana.

- **画像・動画**: 予告編（`hype-video-script.md`）。間に合わなければ、流れの図1枚
- **返信**: サイトの URL

## 2. 10/6（火）登録なしで頼める（x402）

**個人（日本語）**

> エージェントにはカードも銀行口座もありません。あるのはウォレットだけです。
>
> なので、ProofMarket はアカウントを作らなくても使えるようにしました。最初の呼び出しに「402 と金額」を返し、エージェントが USDC の支払いに署名して送り直せば、そのまま依頼になります。

**プロジェクト（英語）**

> No signup, no API key. An agent with a Solana wallet can now pay in USDC and send a request in one round trip, using x402.
>
> 402 with the price → sign the payment → retry → request created.

- **画像・動画**: 見本のエージェントのターミナルの録画（15秒）。402 → 支払い → 201 の流れ
- **返信**: 開発者向けページの URL

## 3. 10/7（水）差し戻しの仕組み

**個人（日本語）**

> 一番時間をかけたのは「差し戻し」でした。
>
> 書き起こしを頼んだのに要約が届く、頼んだ項目が抜けている。こういう提出は、写真の位置と時刻が合っていても通してはいけない。Claude が写真と答えを依頼文と突き合わせ、理由を付けて worker に返します。worker はその場で直せます。

**プロジェクト（英語）**

> Location and timestamp checks aren't enough. A worker can be in the right place and still send a summary when you asked for a transcription.
>
> Every submission is reviewed against the request. If it doesn't match, it goes back to the worker with a reason, and they can fix it on the spot.

- **画像・動画**: スマホの画面2枚を並べる。「確認できませんでした」と理由 →「確認できました」
- **返信**: 仕組みのページの URL

## 4. 10/8（木）最初の数字

**個人（日本語）**

> 公開して【日数】日。人の手で完了した依頼は【完了件数】件、worker は【worker 数】人になりました。
>
> 数字は全部、誰でも見られるページに出しています。少ないうちから出しておくほうが、あとで信じてもらえると思うので。

**プロジェクト（英語）**

> Public stats, updated live: 【completed】 requests completed by real people, 【workers】 workers, 【USDC paid】 USDC paid on Solana devnet.
>
> Every completed result links to its transactions on Solana Explorer.

- **画像・動画**: `/stats` のスクリーンショット
- **返信**: `/stats` の URL

## 5. 10/8（木）worker の募集

**個人（日本語）**

> 東京で、スマホで数分の作業を手伝ってくれる人を探しています。
>
> 店の前の様子を撮る、掲示を書き写す、といった依頼が AI エージェントから届きます。引き受けるかは毎回自分で決められます。暗号資産の知識は要りません。試験運用中なので、報酬はテスト用の USDC です。

**プロジェクト（英語）**

> Looking for people in Tokyo to try ProofMarket as workers. Tasks take a few minutes on your phone: photograph a storefront, transcribe a notice, check a price. No crypto knowledge needed.

- **画像・動画**: worker のアプリの依頼一覧の画面
- **返信**: worker の参加ページの URL（`/workers`）。招待コードの申し込みはそこから

## 6. 10/9（金）写真を最大4枚に

**個人（日本語）**

> worker さんから「1枚だと掲示の全体が入らない」と言われて、写真を4枚まで付けられるようにしました。
>
> 【実際にもらった意見に差し替える。もらっていなければ1文目を「書き起こしの依頼では1枚に収まらないことが多いので」にする】

**プロジェクト（英語）**

> Workers can now attach up to 4 photos per submission. Long notices and multi-page documents no longer have to fit in one frame. The review checks all of them against the request.

- **画像・動画**: 4枚を撮って送るスマホの録画（10秒）
- **返信**: なし

## 7. 10/10（土）なぜ Solana か

**個人（日本語）**

> 1件の報酬は数十円から数百円です。手数料がそれより安くないと成り立ちません。
>
> それと、頼むエージェントと作業する人は互いを知らない。報酬を先にエスクローに入れておけば、作業する人は「払われるかな」と心配しなくていい。結果のハッシュも公開の台帳に残るので、運営者があとから書き換えていないことを誰でも確かめられます。

**プロジェクト（英語）**

> Why Solana:
> - Bounties are cents to a few dollars. Fees have to be smaller than that.
> - The agent and the worker don't know each other. Escrow means the worker knows the money is there before they start.
> - The result hash is on a public ledger, so anyone can check it wasn't changed afterwards.

- **画像・動画**: Explorer の3つの取引（エスクロー・結果の記録・支払い）を並べた画像
- **返信**: 実際の取引の Explorer の URL を1つ

## 8. 10/11（日）外部の開発者の声

**個人（日本語）**

> 外のエージェント開発者【人数】人に試してもらいました。いちばん刺さったのは【もらった意見の要約】でした。
>
> 【意見を受けて直したことがあれば1文】

**プロジェクト（英語）**

> 【external devs】 agent developers outside our team have connected to ProofMarket over MCP or x402 this week. 【one-line quote, with permission】

- **画像・動画**: 開発者のエージェントが MCP の道具を呼んでいる画面（本人の許可をとる）。無ければ、MCP の接続手順のページの画像
- **返信**: 接続手順のページの URL
- **注意**: 引用は本人の許可をとる。名前を出すかも本人に聞く

## 9. 10/12（月）提出

**個人（日本語）**

> Colosseum に ProofMarket を提出しました。
>
> 8日間で、人の手で完了した依頼は【完了件数】件、worker は【worker 数】人。【いちばん印象に残った依頼を1文で】
>
> 提出した後も止めません。依頼は毎日回し続けます。

**プロジェクト（英語）**

> ProofMarket is submitted to Colosseum.
>
> 【completed】 requests completed by real people. 【workers】 workers. 【USDC paid】 USDC paid on Solana devnet. Every result is public and checkable.
>
> We're not stopping here. Requests keep running every day.

- **画像・動画**: ピッチ動画（3分）。X の上限に合わせて書き出す
- **返信**: 提出ページの URL と `/stats` の URL

## 10. 10/12（月）提出のあと、エージェント開発者へ

**個人（日本語）**

> 日本の、紙と現地にしか無い情報を扱うエージェントを作っている方。店頭の掲示、紙の資料、電話でしか分からないこと。1件試してみてください。動かなかったら直します。

**プロジェクト（英語）**

> Building an agent that needs facts about the physical world in Japan? Store notices, paper documents, things you can only learn by phone.
>
> Send one request. If something doesn't work, tell us and we'll fix it.

- **画像・動画**: MCP の道具を呼んでから JSON が返るまでの録画（20秒）
- **返信**: 開発者向けページの URL
