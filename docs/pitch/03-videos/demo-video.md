# 技術デモ動画の台本（2分45秒）

作成: 2026-10-04 ／ 上限 3分未満
見せる流れ: エージェントが依頼（x402 か MCP）→ worker のアプリ → Claude が差し戻す → 直して合格 → Solana Explorer でエスクロー・結果の記録・支払い → `/stats`
ナレーションは英語（審査員向け）。横に日本語訳。【】は収録の当日に埋める。

## 筋書き

依頼は `SIGN_TRANSCRIPTION`（看板・掲示の書き起こし）にする。差し戻しの理由が誰にでも分かるため。

- エージェントの頼みごと: 「この店の入口に貼ってある営業時間の掲示を、書いてあるとおりに書き起こしてほしい」
- 1回目: worker は「平日11時〜20時、日曜休み」と要約して送る → Claude が差し戻す（書き起こしではなく要約になっている）
- 2回目: worker が掲示の文面を一字一句書き写して送る → 合格 → 確定 → 支払い

撮る店は、店主に撮影の了解をとった所にする【店の名前と了解の有無】。人の顔が写らない向きで撮る。

## カット表

| 時間 | 画面 | ナレーション（英語） | 日本語訳 |
|---|---|---|---|
| 0:00–0:10 | 題字「ProofMarket — technical demo」と構成図（エージェント／API／worker のアプリ／確認／Solana） | This is ProofMarket running on Solana devnet. An agent asks a person to do something it can't do itself, and gets back a result that's been checked. | Solana Devnet で動いている ProofMarket です。エージェントが自分ではできないことを人に頼み、確かめた結果を受け取ります。 |
| 0:10–0:35 | ターミナル: `scripts/x402-agent.ts` を実行。402 の応答 → 支払いの署名 → 再送 → 201 と verification ID | The agent has a wallet and nothing else. No account, no API key. It calls our x402 endpoint, gets a 402 with the price, signs a USDC payment, and retries. The request is created. | エージェントが持っているのはウォレットだけ。アカウントも API キーもありません。x402 の窓口を呼ぶと 402 と金額が返り、USDC の支払いに署名して再送すると、依頼ができます。 |
| 0:10–0:35（代わり） | Claude Desktop など: MCP の道具 `request_reality_verification` を呼ぶ画面 | (x402 が使えない場合) The agent calls our MCP tool, request_reality_verification, with the question and the answer format. | （x402 が使えない場合）エージェントは MCP の道具 request_reality_verification を、質問と答えの形を付けて呼びます。 |
| 0:35–0:45 | Explorer: エスクローの取引（initialize_task） | The bounty is now locked in an escrow account on Solana. The worker knows the money is there before starting. | 報酬は Solana のエスクローに入りました。worker は、お金があることを確かめてから動けます。 |
| 0:45–1:05 | スマホの画面録画: 依頼の一覧 → 依頼を開く → 引き受ける → カメラで掲示を撮る → 要約を入力して送信 | On the worker's phone, the task shows up in a browser app. They accept it, take a photo of the notice in the app, and type an answer. Here they've summarized it instead of transcribing it. | worker のスマホでは、ブラウザのアプリに依頼が出ます。引き受けて、アプリで掲示を撮り、答えを入力します。ここでは書き起こさずに要約してしまっています。 |
| 1:05–1:20 | スマホ:「内容を確認しています」→「確認できませんでした」と理由、「あと 2 回やり直せます」 | Automated checks pass: the nonce, the time, the location, and the photo isn't reused. Then Claude reviews the photo and answer against the request, and sends it back with a reason the worker can act on. | 機械的な検査（合言葉・時刻・位置・写真の使い回し）は通ります。そのあと Claude が写真と答えを依頼と突き合わせ、worker が直せる理由を付けて差し戻します。 |
| 1:20–1:35 | スマホ: 掲示の文面をそのまま入力し直して送信 →「確認できました」 | The worker rewrites it word for word and resubmits within the same claim. This time it passes. | worker は一字一句書き写し、同じ引き受けのまま送り直します。今度は合格です。 |
| 1:35–1:55 | ターミナル: エージェントが結果を受け取る。JSON の `status: VERIFIED`、`checks`、`reviews`（Claude の判定と理由）を強調 | The agent receives structured JSON: the status, every check, and Claude's verdict for each accepted submission. It can branch on this without a human looking at the photo. | エージェントは JSON を受け取ります。状態、すべての検査、合格した提出ごとの Claude の判定。人が写真を見なくても、これで次の処理に分岐できます。 |
| 1:55–2:20 | Explorer: 結果の記録（finalize_verification）と支払い（settle）の取引。公開の結果ページ `/r/<id>` の result_hash と見比べる | Two more transactions: the result hash is recorded, and the worker is paid from escrow. The public result page shows the same hash, so anyone can check that the result wasn't changed afterwards. The transcription itself stays off-chain; only its hash is public. | 取引がさらに2つ。結果のハッシュの記録と、エスクローから worker への支払いです。公開の結果ページにも同じハッシュが出るので、あとで結果が書き換えられていないことを誰でも確かめられます。書き起こしの本文はチェーンに載せず、ハッシュだけを公開します。 |
| 2:20–2:35 | `/stats`: 完了件数・支払い総額・Claude の確認の内訳 | Every completed request adds to our public stats. So far: 【completed】 requests completed, 【USDC paid】 USDC paid, 【sent back】 submissions sent back by review. | 完了した依頼は公開の実績に積み上がります。いままでに完了【完了件数】件、支払い【支払い総額】USDC、確認で差し戻した提出【差し戻し数】件。 |
| 2:35–2:45 | 構成図に戻り、オンチェーンとオフチェーンの境目を色分け | On-chain: escrow, result hash, payment. Off-chain: photos, text, and the review. That split keeps workers' photos private and the outcome verifiable. | チェーンの上はエスクロー・結果のハッシュ・支払い。チェーンの外は写真・文章・確認。この分け方で、worker の写真は守りつつ、結果は確かめられるようにしています。 |

## 収録する画面の一覧

| # | 画面 | 撮り方 | 注意 |
|---|---|---|---|
| 1 | 構成図 | 静止画（スライドで作る） | オンチェーンとオフチェーンを色で分ける |
| 2 | ターミナル: x402 の見本のエージェント | 画面録画。文字を大きく（18pt 以上） | A の PR が本番に入ってから撮る。入っていなければ #3 に替える。秘密の値（鍵の場所の中身・API キー）を映さない |
| 3 | MCP の道具を呼ぶ画面（予備） | Claude Desktop か Claude Code で録画 | E が接続を確かめてから撮る |
| 4 | Explorer: エスクローの取引 | ブラウザ録画（devnet の表示を見せる） | URL の `?cluster=devnet` を映す |
| 5 | worker のスマホ: 一覧 → 引き受け → 撮影 → 送信 | スマホの画面録画 | 位置情報の許可のダイアログは切ってよい。人の顔を写さない |
| 6 | worker のスマホ: 「内容を確認しています」→ 差し戻し | スマホの画面録画 | Claude の確認はオーナーの Mac の launchd が2分ごとに動かす。待ち時間は編集で詰め、詰めたことを画面の隅に「(2 min skipped)」と出す |
| 7 | worker のスマホ: 書き直して合格 | スマホの画面録画 | 同じ引き受けのまま送り直す |
| 8 | ターミナル: 結果の JSON | 録画。`reviews` と `checks` の行を色で強調 | 依頼者だけが見られる文章が映るので、店の了解をとった掲示だけにする |
| 9 | Explorer: 結果の記録と支払い | ブラウザ録画 | 2つの取引を並べて見せる |
| 10 | 公開の結果ページ `/r/<id>` | ブラウザ録画 | 写真が出ないことも一瞬見せる |
| 11 | `/stats` | ブラウザ録画 | C の PR が入ってから撮る |

## 収録前に確かめること

- Devnet の treasury に試験用の USDC が足りているか
- オーナーの Mac で `com.proofmarket.review-runner` が動いているか（止まっていると確認が止まり、依頼が締め切りで不成立になる）
- worker 役のアカウントが招待済みで、信頼度の条件に引っかからないか
- x402 の見本のエージェントのウォレットに試験用の USDC があるか
