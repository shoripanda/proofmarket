# 15. 実際のお金で動かす準備と SOL での支払い

作成: 2026-10-11 ／ 決めたこと: 運営者（2026-10-11）

## 1. 結論

ハッカソンの提出（10/12）は Devnet のまま出す。そのうえで次の 2 つを進める。

- **SOL での支払いを足す。** 報酬・前払い残高・証人への支払いを、USDC に加えて SOL でも扱えるようにする。Devnet で作って確かめる。
- **メインネットへの切り替えを「旗を立てるだけ」の状態にする。** 設定・鍵の分け方・配置手順・入金の検出をそろえる。ただし法務の確認（D-05、`legal-checklist.md` §1・§3・§7）が済むまで、メインネットではサーバーが起動しない。

実際のお金はこの章の作業では一切動かない。

## 2. いまの作りと、実際のお金で困る点

| 項目 | いま | 実際のお金で困る点 |
|---|---|---|
| ネットワーク | `solana-devnet` を API の型に直書き（`network: z.literal("solana-devnet")`） | メインネットの値を受け付けない |
| 起動時の検査 | genesis hash が `SOLANA_EXPECTED_GENESIS_HASH` と一致しなければ止まる | 検査はあるが、メインネットを許す条件が無い |
| 通貨 | USDC だけ（`asset: z.literal("USDC")`、プログラムの `Config.bounty_mint` は 1 つ） | SOL が使えない |
| 入金 | 運営者が `admin-service` で TOPUP 行を手で足す | 依頼者が自分で入金できない。入金の証拠も残らない |
| 預かり | 前払い残高とエスクローを運営の鍵が動かす（D-05） | 日本では登録が要る可能性がある。法務の確認が先 |
| 鍵 | operator と verifier はサーバーの環境変数、admin は手元 | 実際のお金を持つ鍵がサーバーにある |

## 3. SOL 対応

### 3.1 オンチェーンは wSOL で扱う

SOL はそのままではトークン口座に入らない。プログラムは SPL トークンの口座（vault）でエスクローしているので、SOL は **wSOL**（ネイティブミント `So11111111111111111111111111111111111111112`）として扱う。これなら initialize_task・settle・refund の流れを変えずに済む。

プログラム v1.2 で、ミントを 1 つに縛る制約を外す。

- 新しい PDA `AllowedMint`（seeds `["mint", mint]`）に `mint`・`treasury`（operator の ATA）・`decimals`・`bump` を持たせる。
- 命令 `add_mint`（admin だけ）で USDC と wSOL を登録する。`Config.bounty_mint` は互換のため残し、`AllowedMint` が無い古い呼び出しはこれまでどおり `Config.bounty_mint` で受ける。
- initialize_task は、task の mint に `AllowedMint` があることを確かめる。資金の出どころは、その `AllowedMint.treasury`。
- `Task` のレイアウトは変えない（`mint` の欄は既にある）。

証人には wSOL のまま払う。証人の画面に「SOL として受け取る」ボタンを置き、wSOL 口座を閉じてネイティブの SOL に戻す（証人の Privy の財布が署名する）。プログラムの中で戻すと、受取人が複数いるときに口座を閉じられないためである。

### 3.2 金額の桁

API の金額は、USDC と SOL のどちらも小数 6 桁までの文字列で受ける。DB の `numeric(20,6)` をそのまま使える。オンチェーンへ渡すときだけ通貨ごとの桁に直す（USDC は 10^6、SOL は 10^9 なので 1,000 倍する）。SOL の 0.000001 は約 0.02 円で、報酬の刻みとしては足りる。

- 報酬の下限: SOL は 0.001（`LIMITS.minSolBounty`）。USDC はこれまでどおり下限を設けない
- 為替は持たない。依頼者が決めた通貨と金額で払う。円での目安は画面の表示だけに使い、計算には使わない

### 3.3 API とデータ

- `bounty.asset` を `"USDC" | "SOL"` に広げる。前払い残高・報酬・手数料・x402 の各所も同じ。
- 前払い残高は通貨ごとに分けて数える。台帳 `requester_ledger.asset` は既にあるので、残高の集計に `asset` を足す。残高が足りるかの判定も、依頼と同じ通貨の残高で行う。
- 上がる報酬（13 §1）・異議の保証金（13 §3）・手数料は、依頼の通貨で積む。
- 証人の稼ぎ・明細 CSV・公開の統計は通貨ごとに出す。合計を 1 つの数にまとめない。
- 旗 `SOL_ENABLED`（既定 off）で受付を開く。off のあいだは `asset: "SOL"` を `UNSUPPORTED_ASSET` で断る。
- **x402 は USDC だけのまま。** x402 の `exact` 方式は SPL トークンの送金を前提にしている。SOL の 1 件払いは、需要が見えてから考える。

## 4. メインネットへの切り替え

### 4.1 クラスタの設定と起動の門

環境変数 `SOLANA_CLUSTER`（`devnet` か `mainnet-beta`、既定 `devnet`）を足す。値から次を決める。

| | devnet | mainnet-beta |
|---|---|---|
| genesis hash | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| USDC のミント | Circle の Devnet USDC（いまの `BOUNTY_MINT`） | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| wSOL | `So11111111111111111111111111111111111111112` | 同じ |
| API の `network` | `solana-devnet` | `solana` |

メインネットで起動する条件は 3 つで、1 つでも欠ければ起動時に止まる（REQ-X-P-105 の「コードで禁止」を、条件つきの許可に置き換える）。

1. `REAL_FUNDS_ENABLED=true`
2. `LEGAL_SIGNOFF` に、法務の確認結果を記した文書の場所が入っている（例: `docs/legal/2026-xx-signoff.md`）。中身は読まないが、空なら止まる
3. 鍵がメインネット用であること。Devnet で使った operator・verifier の公開鍵と同じなら止まる（08 §2「Mainnet で同じ鍵を使わない」）

genesis hash は実際の RPC に問い合わせて確かめる（いまと同じ）。`SOLANA_CLUSTER` と RPC の向き先が食い違えば止まる。

### 4.2 鍵とお金の置き場

- **admin** は手元のハードウェア財布か Squads のマルチシグに置き、サーバーには置かない。プログラムの更新権限も同じ。
- **operator**（treasury の持ち主・エスクローへの入金）はサーバーにある。実際のお金を持つ鍵なので、treasury に置く額に上限を決め、超えた分は admin の口座へ移す。上限は運用の判断（目安: 1 日の支払い見込みの 2 倍）。
- **verifier**（判定の記録）はお金を動かせないので、いまと同じ扱いでよい。
- 手数料の SOL（取引手数料・口座の rent）は operator が払う。残高の警告（08 §5、tick の SOL 残高）は今の仕組みを使い、しきい値をメインネット用に上げる。

### 4.3 入金を自分でできるようにする

いまは運営者が手で TOPUP を足している。実際のお金では、依頼者が送ったことを確かめてから残高に入れる必要がある。

- 依頼者ごとに参照用の公開鍵（Solana Pay の `reference`）を発行し、入金先の画面に「この treasury へ、この参照つきで送る」と QR とともに出す。
- tick で treasury への着金を `getSignaturesForAddress(reference)` で探し、確定（finalized）した送金だけを TOPUP にする。署名を台帳に残し、同じ署名を二度数えない（一意制約）。
- 通貨は USDC と SOL（ネイティブの SOL で受け、operator が wSOL に包む）。
- この仕組みは Devnet でも使えるので、先に Devnet で動かす。

### 4.4 プログラムの配置

- 配置の費用: いまの .so（291,720 B）で、プログラムの口座に約 2.03 SOL。配置中はバッファにも同じくらい要り、終われば戻る。手元に 4.5 SOL ほど用意する。
- 手順は Devnet と同じ（`cargo build-sbf --tools-version v1.57` → `cargo test -p proofmarket` → `solana program deploy`）。メインネットでは新しいプログラム ID になる。
- 配置後に `initialize_config`・`add_mint`（USDC と wSOL）を admin で実行する。
- 第三者の監査は受けていない。実際のお金を入れる前に、少なくとも v1.2 の差分を外部の目で見てもらう。

### 4.5 切り替えの手順（法務の確認が済んだ日）

1. メインネット用の operator・verifier の鍵を作る（`~/.config/proofmarket/mainnet/`、リポジトリに入れない）
2. プログラムを配置し、config と mint を登録する
3. Vercel の Production に `SOLANA_CLUSTER=mainnet-beta`・`SOLANA_RPC_URL`（有料の RPC）・`PROGRAM_ID`・鍵・`REAL_FUNDS_ENABLED`・`LEGAL_SIGNOFF` を入れる
4. 試験用の残高（/join の 5 USDC）を止める。メインネットでは配らない
5. 運営者自身が少額（0.10 USDC と 0.001 SOL）で依頼から支払いまでを一周し、Solscan で確かめる
6. 料金ページと利用規約の「試験運用」の文言を直す

## 5. 作業の順番

| PR | 中身 | お金 | 移行 |
|---|---|---|---|
| 1 | この設計書 | 動かない | なし |
| 2 | `SOLANA_CLUSTER` と起動の門（4.1）。既定は devnet で、本番の動きは変わらない | 動かない | なし |
| 3 | SOL のオフチェーン部分（3.2・3.3）。`SOL_ENABLED` は off | 動かない | 残高集計の索引のみ |
| 4 | プログラム v1.2（3.1）とテスト。Devnet へ配置し、wSOL を登録 | Devnet だけ | なし |
| 5 | 証人の「SOL として受け取る」と、Devnet で `SOL_ENABLED=true` | Devnet だけ | なし |
| 6 | 入金の検出（4.3） | Devnet だけ | 入金の表 |
| 7 | メインネットの手順書（4.4・4.5）を `12-deploy-runbook.md` に足す | 動かない | なし |

提出の前日なので、PR 2 以降は既定値で本番の動きが変わらないことを確かめてからマージする。

## 6. まだ決めていないこと

- treasury に置く額の上限（4.2）
- メインネットの RPC の契約先（Helius・Triton など。無料の公開 RPC は上限が低く、本番には向かない）
- 証人への支払いを、労働法規と源泉徴収の面でどう扱うか（`legal-checklist.md` §1・§7）
- 手数料を取るか、取るならどの通貨で取るか（`docs/pitch/08-revenue-model.md`）
