# ピッチ資料の構成（11枚）

作成: 2026-10-04 ／ 対応する台本: `pitch-video-script.md`（3分未満）
流れ: Hook → Problem → Solution → Product → Demo → Business Model → Traction → Team → CTA（`docs/colosseum-hackathon-playbook-2026-09-16.md` §3）

**【】はオーナーが埋める所。** 数字は `/stats` から写す。創業者の話はオーナーが書く。

使わない言葉: 「初の」「唯一の」「革新的」「民主化」、および「AI が人を雇う」だけの説明（`specs/proofmarket/competitor-differentiation.md` §6）。

各スライドは「題」「一言（いちばん大きく出す一文）」「絵の案」「話すこと」の4つで書く。一言だけを上から順に読んでも話が通るようにしてある。

---

## 日本語版

### 1. Hook

- **題**: ProofMarket
- **一言**: AI は人に作業を頼めるようになった。でも、届いた結果が本当かは確かめられない。
- **絵**: 店のシャッターの写真の横に、エージェントの画面で「営業中（Web 情報）」と出ている対比
- **話すこと**: 予約エージェントに「今夜この店は開いているか」と聞くと、古いかもしれない Web の情報で答える。その場にいないエージェントには、確かめる手段が無い。【オーナーの実体験があれば差し替える】

### 2. Problem

- **題**: 頼めても、確かめられない
- **一言**: 人に頼むサービスはある。足りないのは、結果を確かめて機械が使える形で返すところ。
- **絵**: 3段の図。依頼 →（人が作業）→ 写真と文章が届く →「？ これは依頼どおり？」
- **話すこと**:
  - RentAHuman・Taskin・NeedaHuman など、エージェントが人に頼めるサービスは 2026 年にいくつも出ている
  - それでも、届いた写真が頼んだ店か、頼んだ項目がそろっているかは、頼んだ側が判断するしかない
  - エージェントには判断の材料が無いので、人間の担当者が見るか、確かめずに使うかになる

### 3. 最初の入口

- **題**: 日本の、紙と現地にしか無い情報
- **一言**: 店頭の掲示、紙の資料、窓口や電話でしか分からないことは、どれだけ賢いエージェントにも届かない。
- **絵**: 店頭の「臨時休業」の貼り紙、役所の紙の案内、電話の受話器の3枚の写真
- **話すこと**: 最初は東京で、この種類の情報に絞る。【オーナー確認待ち: 入口をこれで確定してよいか】

### 4. Solution

- **題**: ProofMarket
- **一言**: 人の作業の結果を、依頼した AI が信用できる形で返す。
- **絵**: 横一列の流れ。エージェントが依頼 → worker が撮影して答える → 検査と Claude の確認 → 複数人の合意 → Solana に記録と支払い → エージェントに JSON
- **話すこと**: 依頼の時点で報酬をエスクローに入れる。届いた提出は、機械的な検査と Claude の確認の両方を通ったものだけを数える。複数人の答えが一致したら確定し、結果のハッシュを Solana に残して worker に払う。

### 5. 違い

- **題**: 他社との違い
- **一言**: 違いは「頼めること」ではなく、結果をそのまま使える状態にしてから返すこと。
- **絵**: 表。行は「人に頼める」「写真と位置の確認」「提出ごとの中身の確認と差し戻し」「複数人の合意」「結果のハッシュを公開の台帳に記録」「登録なしで払って頼める」。ProofMarket の列にだけ印を付けるのではなく、他社にもある項目は他社にも付ける
- **話すこと**: 人に頼めること、写真と位置の確認は、他社にもある。ProofMarket が足すのは下の4行。他社に無いとは言わない（調べきれていないため）。

### 6. Product

- **題**: いま動いているもの
- **一言**: どのエージェントからでも、REST・MCP・x402 で同じように頼める。
- **絵**: 左にエージェントのコード（MCP の道具の呼び出し）、右に worker のスマホの画面
- **話すこと**:
  - 依頼の種類は 17。店の営業・行列・在庫・値段・看板の書き起こし・紙の資料・電話など
  - worker はスマホのブラウザだけで参加できる。暗号資産の知識もウォレットの準備も要らない
  - x402 なら、エージェントは API キーの登録もせず、USDC を払ってその場で頼める（A の PR が入ってから載せる）

### 7. Demo

- **題**: 差し戻して、直して、合格する
- **一言**: 依頼と違う提出は、理由つきで差し戻される。worker が直すと合格し、支払いまで Solana に残る。
- **絵**: デモ動画の4コマ（依頼 → 差し戻しの画面 → 合格 → Explorer）。動画は `demo-video-script.md`
- **話すこと**: いちばん見せたい場面は差し戻し。「書き起こしを頼んだのに要約になっている」と Claude が返し、worker が書き直して合格する。

### 8. Business Model

- **題**: 依頼ごとに払う
- **一言**: エージェントは1件ごとに worker の報酬と確認の手数料を払う。人数を増やせば確かさが上がり、値段も上がる。
- **絵**: 1件の内訳の図。worker の報酬 × 人数 ＋ 手数料
- **話すこと**: いまの手数料は 0（試験運用）。料率は、worker の費用・待ち時間・依頼側が払ってよい額を測ってから決める。同じ店の直近の結果を再利用すれば、人を出さずに安く返せる。

### 9. Traction

- **題**: 実績（`/stats` で誰でも確かめられる）
- **一言**: 【完了件数】件の依頼が人の手で完了し、【支払い総額】USDC が worker に払われた。
- **絵**: `/stats` のスクリーンショット。大きな数字3つと、日ごとの完了件数の棒グラフ
- **話すこと**:
  - worker 【worker 数】人、依頼から結果までの中央値【中央値の分】分
  - Claude の確認で差し戻した提出【差し戻し数】件、そのうち直して合格【再提出で合格した数】件
  - 試してくれた外部の開発者【外部開発者数】人。もらった意見【意見を1つ引用】

### 10. Team

- **題**: チーム
- **一言**: 【オーナーが書く: なぜ自分がこの問題を解くのか、を一文で】
- **絵**: 顔写真と名前、X のアカウント
- **話すこと**: 【オーナーが書く】次の問いへの答えを材料にする。
  1. AI に頼んだ調べものが、現地や紙の情報のせいで行き詰まった経験は何か
  2. なぜ「頼む」より「確かめる」が大事だと思ったのか
  3. ハッカソンの後も続ける理由は何か
  - 書ける事実: 10/2 に仕様を固め、10/4 までに API・MCP・worker のアプリ・Solana のプログラム・AI の確認を本番に出した

### 11. CTA

- **題**: 試してください
- **一言**: あなたのエージェントから、今日1件頼んでみてください。
- **絵**: QR コード2つ（開発者向けページと、worker の参加ページ）と URL
- **話すこと**: エージェントを作っている人は開発者向けページから MCP か x402 で。東京にいる人は worker として参加できる。

---

## English version

### 1. Hook

- **Title**: ProofMarket
- **Message**: Agents can now hire people. They still can't tell whether the work they get back is real.
- **Visual**: A photo of a shuttered shop next to an agent UI saying "Open (per web data)"
- **Talk track**: Ask a booking agent whether a restaurant is open tonight. It answers from web data that may be stale. An agent that isn't there has no way to check. [Replace with the owner's own experience if there is one]

### 2. Problem

- **Title**: You can ask, but you can't verify
- **Message**: Services for hiring people exist. What's missing is checking the result and handing it back in a form software can use.
- **Visual**: Three steps: request → (a person works) → photo and text arrive → "Is this what I asked for?"
- **Talk track**:
  - Several 2026 services (RentAHuman, Taskin, NeedaHuman) let agents hire people
  - The requesting agent still has to judge whether the photo shows the right shop, or whether every requested field is there
  - It has nothing to judge with, so either a human reviews it or it goes unchecked

### 3. Beachhead

- **Title**: Information that only exists on paper and on-site in Japan
- **Message**: Store notices, paper documents, and answers you only get at a counter or by phone are out of reach for any agent, however capable.
- **Visual**: Three photos: a "temporarily closed" notice, a paper form at a city office, a phone handset
- **Talk track**: We start in Tokyo with this kind of information. [Owner to confirm the beachhead]

### 4. Solution

- **Title**: ProofMarket
- **Message**: We return the result of human work in a form the requesting agent can trust.
- **Visual**: Agent request → worker captures and answers → automated checks + Claude review → multi-witness agreement → record and payment on Solana → JSON back to the agent
- **Talk track**: The bounty goes into escrow when the request is made. A submission only counts after it passes both the automated checks and Claude's review. When witnesses agree, the result hash is recorded on Solana and the workers are paid.

### 5. Difference

- **Title**: How we differ
- **Message**: The difference isn't that agents can ask. It's that the result arrives already checked and ready to use.
- **Visual**: Comparison table with rows: hire people / photo + location checks / per-submission content review with send-back / multi-witness agreement / result hash on a public ledger / pay-and-ask without signup. Mark competitors where they have the feature
- **Talk track**: Hiring and photo + location checks exist elsewhere. We add the last four rows. We don't claim others lack them; we haven't verified that.

### 6. Product

- **Title**: What runs today
- **Message**: Any agent can ask the same way, over REST, MCP, or x402.
- **Visual**: Left: agent code calling the MCP tool. Right: the worker's phone screen
- **Talk track**:
  - 17 task types: whether a shop is open, queues, stock, prices, sign transcription, paper documents, phone inquiries, and more
  - Workers join from a phone browser. No crypto knowledge or wallet setup needed
  - With x402, an agent pays USDC and asks on the spot, with no API key signup (include after Track A's PR is merged)

### 7. Demo

- **Title**: Sent back, fixed, accepted
- **Message**: A submission that doesn't match the request is sent back with a reason. The worker fixes it, it passes, and the payment lands on Solana.
- **Visual**: Four frames from the demo video (request → send-back screen → accepted → Explorer). See `demo-video-script.md`
- **Talk track**: The moment to show is the send-back. Claude says "you summarized instead of transcribing," the worker rewrites it, and it passes.

### 8. Business Model

- **Title**: Pay per request
- **Message**: Agents pay per request: the worker bounty plus a verification fee. More witnesses means more assurance, at a higher price.
- **Visual**: Breakdown of one request: bounty × witnesses + fee
- **Talk track**: The fee is zero during the pilot. We'll set it after measuring worker cost, latency, and what requesters will pay. Reusing a recent result for the same shop returns an answer without sending anyone, at lower cost.

### 9. Traction

- **Title**: Traction (verifiable by anyone at `/stats`)
- **Message**: [completed] requests were completed by real people, and [USDC paid] USDC was paid to workers.
- **Visual**: Screenshot of `/stats`: three big numbers and a daily completions bar chart
- **Talk track**:
  - [workers] workers, median time from request to result [median] minutes
  - Claude sent back [sent back] submissions; [fixed and accepted] were fixed and accepted
  - [external devs] external developers tried it. Feedback: [quote one]

### 10. Team

- **Title**: Team
- **Message**: [Owner: one sentence on why you are the one to solve this]
- **Visual**: Photo, name, X handle
- **Talk track**: [Owner writes. Use the three questions in the Japanese version.]
  - Fact we can state: spec fixed on Oct 2; by Oct 4 the API, MCP server, worker app, Solana program, and AI review were live in production

### 11. CTA

- **Title**: Try it
- **Message**: Send one request from your agent today.
- **Visual**: Two QR codes (developer page and worker sign-up) and the URL
- **Talk track**: Agent builders: connect over MCP or x402 from the developer page. In Tokyo: join as a worker.
