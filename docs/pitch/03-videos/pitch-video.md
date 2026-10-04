# ピッチ動画の台本（2分50秒）

作成: 2026-10-04 ／ 対応: `../02-deck/deck-ja.md`・`deck-en.md` の11枚
長さ: 2分50秒を目標（上限 3分未満）。英語のナレーションは約 340 語で、毎分 130 語前後の落ち着いた速さで読むと収まる。
話し手: オーナー（声・出演）。【】は収録前にオーナーが埋める。

## 収録の決まり

- 審査員向けに英語で話す。日本語訳は練習と字幕の下書き用
- 数字は収録の当日に `/stats` から写す。台本の【】に入れてから読む
- 画面の録画は `demo-video.md` の素材を使い回してよい
- 字幕を英語で焼き込む（音を出さずに見る審査員もいる）

## カット表

| 時間 | 画面 | ナレーション（英語） | 日本語訳 |
|---|---|---|---|
| 0:00–0:12 | 閉まったシャッターの写真。横にエージェントの画面「Open (per web data)」 | Ask an agent whether a restaurant is open tonight. It answers from web data that may be weeks old. It has no way to check, because it isn't there. | エージェントに「今夜この店は開いているか」と聞くと、何週間も前かもしれない Web の情報で答える。確かめようがない。その場にいないのだから。 |
| 0:12–0:32 | 3段の図。依頼 → 人が作業 → 写真と文章が届く →「？」 | Agents can already hire people for real-world tasks. Several services do that. But when the photo and the answer come back, the agent still can't tell if the work matches what it asked for. So a human checks it, or nobody does. | エージェントが現実の作業を人に頼むことは、もうできる。そういうサービスはいくつもある。でも写真と答えが届いても、それが頼んだとおりかをエージェントは判断できない。だから人が確認するか、誰も確認しないかになる。 |
| 0:32–0:47 | 店頭の貼り紙・紙の資料・電話の3枚 | We start where this hurts most: information in Japan that only exists on paper or on-site. Store notices, paper documents, things you only learn by phone. | まずは、いちばん困る所から始める。日本の、紙と現地にしか無い情報。店頭の掲示、紙の資料、電話でしか分からないこと。 |
| 0:47–1:10 | 流れの図が左から順に光る | ProofMarket returns the result of human work in a form the agent can trust. The bounty goes into escrow on Solana. A worker does the task on their phone. Every submission passes automated checks, then Claude reviews it against the request. When witnesses agree, the result hash is recorded on Solana and the worker is paid. | ProofMarket は、人の作業の結果を、依頼した AI が信用できる形で返す。報酬は Solana のエスクローに入る。worker はスマホで作業する。提出はすべて機械的な検査を通り、そのあと Claude が依頼と突き合わせる。答えが一致したら結果のハッシュを Solana に残し、worker に払う。 |
| 1:10–1:40 | デモ動画の早回し: 依頼 → 差し戻し → 書き直し → 合格 | Here's the part that matters. An agent asks a worker to transcribe a notice. The worker sends a summary instead. Claude sends it back: "This is a summary, not a transcription." The worker rewrites it, it passes, and the agent gets structured JSON it can act on. | 大事なのはここ。エージェントが掲示の書き起こしを頼む。worker は要約を送ってしまう。Claude が差し戻す。「これは要約で、書き起こしではありません」。worker が書き直すと合格し、エージェントはそのまま使える JSON を受け取る。 |
| 1:40–1:55 | Solana Explorer。エスクロー・結果の記録・支払いの3つの取引 | Escrow, the result record, and the payout are all on Solana. Anyone can verify them later. | エスクロー、結果の記録、支払い。すべて Solana にあり、誰でもあとから確かめられる。 |
| 1:55–2:08 | MCP のコードと x402 の 402 応答 | Any agent can use it over REST or MCP. With x402, an agent can pay in USDC and ask without signing up. | どのエージェントからも REST か MCP で使える。x402 なら、登録せずに USDC を払って頼める。【A の PR が入っていなければこの行を削る】 |
| 2:08–2:28 | `/stats` の画面。大きな数字3つ | Since launch, 【completed】 requests have been completed by real people, and 【USDC paid】 USDC has gone to 【workers】 workers. Claude sent back 【sent back】 submissions, and 【fixed and accepted】 were fixed and accepted. | 公開してから、【完了件数】件の依頼が人の手で完了し、【worker 数】人の worker に【支払い総額】USDC が払われた。Claude は【差し戻し数】件を差し戻し、そのうち【再提出で合格した数】件が直って合格した。 |
| 2:28–2:42 | オーナーの顔 | 【Owner: one or two sentences on why you are building this】 | 【オーナー: なぜこれを作るのかを1〜2文で】 |
| 2:42–2:50 | URL と QR コード2つ | If you build agents, send us one request today. If you're in Tokyo, join as a worker. | エージェントを作っているなら、今日1件頼んでみてほしい。東京にいるなら、worker として参加してほしい。 |

英語のナレーションの合計: 【】を除いて約 330 語。【】を埋めたら声に出して計り、2分55秒を超えたら 0:32–0:47 の段を短くする。

## 冒頭の一文について

0:00 の話は、オーナーの実体験に差し替えるといちばん強い。台本には作り話を置かず、誰にでも起こる場面で書いた。実体験があれば、同じ12秒の長さで次の形に替える。

> 【When did an agent (or a web search) give you a wrong answer about something physical? What was it, and what happened?】
>
> 【エージェントや Web 検索が、現実のことで間違った答えを返したのはいつか。何についてで、どうなったか】
