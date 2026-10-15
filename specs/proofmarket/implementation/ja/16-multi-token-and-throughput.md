# 16. 他の SPL トークンでの支払いと、決済の処理量

作成: 2026-10-14 ／ 依頼: 運営者「性能を高めよう。他のソラナチェーンの通貨も対応可能にしたい」

## 1. 結論

報酬に使える通貨を「USDC と SOL の 2 つ」から「台帳に載せたトークンなら何でも」に広げる。あわせて、決済ジョブを並列に流して、メインネットで依頼が詰まらないようにする。

- **通貨はコードの台帳 1 か所で決める。** 新しい通貨は、台帳に 1 行足して、admin が `add_mint` を 1 回実行し、環境変数で受付を開くだけで使える。最初の台帳は USDC・SOL・USDT・PYUSD・USDG・EURC・JUP・BONK・JitoSOL・mSOL・cbBTC の 11 通貨にする。
- **プログラムを v1.3 に上げ、Token-2022 のトークンも預かれるようにする。** PYUSD と USDG は Token-2022 なので、いまの v1.2 では預かれない。メインネットにはまだ何も載せていないので、最初から v1.3 を載せる。
- **決済ジョブを 1 件ずつ待つのをやめる。** tick が一度に最大 6 件を並列で流し、1 回の tick を 300 秒の上限に収める。送信の作り（優先手数料・再送・blockhash）もメインネット向けに直す。

為替は持たない、という 15 §3.2 の方針は変えない。依頼者が決めた通貨と額で預かり、同じ通貨で払う。

## 2. いまの作りで困る点

### 2.1 通貨が 2 つに固定されている

`AssetSchema = z.enum(["USDC", "SOL"])`（`packages/core/src/schemas/api.ts`）を起点に、通貨名を直接比べる箇所がサービス・画面・入金検出に約 70 か所ある。たとえば `settlement-jobs.ts` の `assetOf()` は USDC と SOL 以外を例外にし、`deposits.ts` は USDC の口座と SOL の財布の 2 か所しか見ない。DB の `deposits` には `asset in ('USDC','SOL')` の制約がある。

金額の扱いも 2 通貨が前提になっている。オフチェーンは小数 6 桁で固定し、オンチェーンへ渡すときに `10^(桁 - 6)` を掛ける（`money.ts` の `toBaseUnits`）。BONK のように桁が 5 のトークンでは指数が負になり、この式は使えない。

### 2.2 プログラムは旧来の SPL Token しか扱えない

v1.2 は `AllowedMint` で複数の mint を許せる。ただし口座の型が `Account<Mint>`・`Program<Token>` で、送金は `token::transfer` なので、持ち主が Token-2022 の mint は口座の検査で落ちる。2026-10-14 にメインネットで候補の mint を読んだ結果が次の表である。

| 通貨 | mint | 桁 | プログラム | 気にする点 |
|---|---|---|---|---|
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 | SPL Token | 凍結権あり |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 | SPL Token | 凍結権あり |
| PYUSD | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | 6 | Token-2022 | 永続委任・送金手数料の設定（いまは 0%）・送金フック（未設定） |
| USDG | `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` | 6 | Token-2022 | PYUSD と同じ拡張の組み合わせ |
| EURC | `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr` | 6 | SPL Token | 凍結権あり |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | 6 | SPL Token | なし |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 | SPL Token | 桁が 6 より小さい |
| JitoSOL | `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` | 9 | SPL Token | なし |
| mSOL | `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So` | 9 | SPL Token | なし |
| cbBTC | `cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij` | 8 | SPL Token | 凍結権あり |

SOL は 15 §3.1 のとおり wSOL（`So11111111111111111111111111111111111111112`）で預かり、証人には SOL のまま払う。

### 2.3 決済ジョブが直列で、メインネットでは tick に収まらない

tick は毎分、outbox のジョブを最大 20 件まで 1 件ずつ流す（`jobs.ts` の `tick`）。チェーンのジョブは送信のたびに `finalized` を最大 60 秒待つ。証人の受け取り口座（ATA）が無いと、settle の前に口座を作る取引でもう一度 `finalized` を待つ。

2026-10-14 に公開 RPC で `confirmed` と `finalized` のスロット差を 3 回ずつ測った。メインネットは 31〜32 スロット（1 スロット 0.216 秒で約 6.7〜6.9 秒）、Devnet は 0 だった。いまの本番は Devnet なので待ち時間は目立たない。メインネットでは、送ってから取り込まれるまでを足すと 1 取引あたり 9〜12 秒かかると見込む（推定。切り替え後に実測する）。

この見込みだと、口座作りを伴う settle が 20 件並んだ tick は 360〜480 秒かかり、route の `maxDuration`（300 秒）で打ち切られる。打ち切られたジョブは貸し出し期限（`leaseS` 180 秒）が切れるまで誰も拾わない。50 件の一括依頼（01 §4.25 の batch）は、資金を入れ終わるまで 8 分を超える。

送信の作りにも、メインネットで遅れる原因が 3 つある。

- 優先手数料が `10_000` micro-lamports に固定で、混雑時に取り込まれず blockhash が切れる
- blockhash を `finalized` で取るので、有効期間のうち約 7 秒を最初から失う
- 送信は `sendRawTransaction` の 1 回きりで、取り込まれなかったときの再送を RPC 任せにしている

## 3. 通貨の台帳

### 3.1 台帳の形

`packages/core/src/domain/assets.ts` に、通貨ごとの決まりを 1 行ずつ書く。

```ts
export interface AssetInfo {
  symbol: string;              // API の bounty.asset に入る値。英数字 2〜10 字
  name: string;                // 画面の表示名
  decimals: number;            // オンチェーンの桁（チェーンで確かめた値）
  tokenProgram: "spl-token" | "token-2022";
  native?: true;               // SOL だけ。wSOL で預かり、SOL で払う
  mints: { "mainnet-beta"?: string };  // Devnet と localnet は環境変数（3.3）
  minBounty?: string;          // 技術的な下限があるものだけ（SOL の 0.001）
  x402?: true;                 // x402 で受けるか。USDC だけ
}
```

台帳に載っていない mint は、API も入金検出も受け付けない。チェーン上のどの mint でも受ける作りにはしない。価値の無いトークンや、送金のたびに別プログラムを呼ぶトークンを持ち込まれると、払い出しが止まったり、運営者が口座代を払い続けたりするからである。

台帳の値が本物と食い違うと、お金の桁を誤る。そこで `scripts/check-assets.ts` を足し、メインネットの RPC から各 mint を読んで、桁・持ち主のプログラム・拡張を台帳と突き合わせる。通貨を足すときと、メインネットに配置する前に流す。

### 3.2 受付の開け閉め

環境変数 `ASSETS_ENABLED`（例 `USDC,SOL,USDT,PYUSD`）で、その環境で受ける通貨を決める。既定は `USDC` だけで、本番の動きは変わらない。これまでの `SOL_ENABLED=true` は「`ASSETS_ENABLED` に SOL を足す」と同じ意味として残し、片方だけ書いた環境も動くようにする。

受付が閉じた通貨の依頼は、これまでの SOL と同じく `UNSUPPORTED_ASSET` で断る。閉じても、すでに預かった依頼は払い出しも返金も続く。残高も消えない。

`GET /v1/assets`（認証なし）で、受付中の通貨の記号・名前・桁・mint・下限を返す。エージェントは依頼の前にここを読めばよい。MCP にも同じ一覧を返す道具を足し、`llms.txt` と `/developers` から案内する。

### 3.3 Devnet と localnet

USDC 以外の台帳の通貨は Devnet に存在しない。Devnet と localnet では、mint の住所を環境変数 `ASSET_MINT_<記号>`（例 `ASSET_MINT_PYUSD`）から読む。値が無い通貨は、その環境では使えない扱いにする。

`devnet-setup.ts` に `--test-mints` を足し、試験用の mint を 2 つ作る。

- 旧来の SPL Token で桁 6 のもの（USDT の代わり）
- Token-2022 で、PYUSD と同じ拡張（永続委任・手数料 0% の手数料設定・送金フック未設定・metadata）を持つもの

作った mint は `env.devnet` に `ASSET_MINT_USDT`・`ASSET_MINT_PYUSD` として書き出す。これで、Token-2022 の預かりから支払いまでを Devnet で一周できる。画面とメールでは、Devnet の通貨に「試験用」と添える（`clusterText()` に寄せる）。

## 4. 金額の桁

API と DB の金額は、これまでどおり小数の文字列と `numeric(20,6)` で持つ。変えるのは 2 点である。

- 小数の桁数の上限を `min(6, 通貨の桁)` にする。BONK（桁 5）は小数 5 桁まで、ほかは 6 桁まで。超えた額は `VALIDATION_FAILED`（`reason: "too_many_decimals"`）で断る。黙って切り捨てると、依頼者の書いた額と預かる額がずれるからである。
- `toBaseUnits(micro, asset)` と `fromBaseUnits(base, asset)` は台帳の桁を読み、桁が 6 未満なら割り、6 を超えれば掛ける。割るときに端数が出るのは、上の検査をすり抜けた不具合なので、例外にして止める。入金（`fromBaseUnits`）だけは、これまでどおり 10^-6 未満を切り捨てる。

報酬の下限は、技術的な理由がある SOL の 0.001（rent 免除の最低額、15 §3.2）だけ残す。ほかの通貨には下限を設けない。値段を持たない以上、「いくら以上なら妥当か」をこちらで決める根拠が無い。

## 5. プログラム v1.3（Token-2022）

### 5.1 変えるところ

`Task` と `Config` と `AllowedMint` のレイアウトは変えない。命令の口座の並びも変えない。v1.2 向けのクライアントは、そのまま v1.3 でも動く。

- 口座の型を `InterfaceAccount<Mint>`・`InterfaceAccount<TokenAccount>`・`Interface<TokenInterface>` にする。旧来の SPL Token と Token-2022 のどちらの mint も通る。
- 送金はすべて `transfer_checked` にする。Token-2022 では必須で、旧来の SPL Token でも桁の確認が 1 つ増えるだけで害は無い。
- 証人の口座の検査は `get_associated_token_address_with_program_id` で、mint の持ち主のプログラムに合わせる。
- vault は、mint の拡張が求める分だけ大きく作る（送金手数料の設定がある mint には `TransferFeeAmount` など）。Anchor の `init` が拡張の大きさを数えない場合は、`create_account` と `initialize_account3` を自前で呼ぶ。どちらになるかは実装時に LiteSVM で確かめる。
- `Config.bounty_mint`（USDC）の扱いはこれまでと同じ。

### 5.2 どの拡張を受け入れるか

Token-2022 の mint は、拡張によっては預かったお金が出せなくなる。そこで、知っている拡張だけを通す許可リスト方式にする。`add_mint`（admin）で全部を調べ、`initialize_task` では変わりうる 2 つを毎回調べ直す。

| 拡張 | 扱い | 理由 |
|---|---|---|
| MetadataPointer・TokenMetadata・GroupPointer・GroupMemberPointer | 通す | 表示の情報だけ |
| MintCloseAuthority | 通す | 供給量が 0 でないと閉じられない |
| ConfidentialTransferMint・ConfidentialTransferFeeConfig | 通す | vault と証人の口座で秘匿送金を有効にしない限り、ふつうの送金と同じ |
| PermanentDelegate | 通す（発行元を信頼する通貨だけ台帳に載せる） | 発行元は vault の中身を動かせる。USDC の凍結権と同じ種類の、発行元への信頼である |
| TransferFeeConfig | 手数料が今と次の期の両方で 0 のときだけ通す。`initialize_task` でも調べる | 手数料があると vault に入る額が減り、settle が `InsufficientVaultBalance` で止まる |
| TransferHook | 呼ぶプログラムが未設定のときだけ通す。`initialize_task` でも調べる | フックが設定されると、送金に余分な口座が要り、settle と refund の口座の並びが合わなくなる |
| Pausable | 通す | 止められている間は払えないが、凍結と同じく再開を待てばよい |
| NonTransferable・DefaultAccountState（凍結）・上の表に無い拡張 | 断る | 預かれない、または挙動を確かめていない |

`initialize_task` で調べ直すのは、手数料とフックは発行元が後から変えられるからである。預かった後に変えられた場合は、払い出しが止まる可能性が残る。これは発行元を信頼して台帳に載せることの裏返しで、台帳に載せるかどうかの判断に含める（9 章）。

### 5.3 テストと配置

LiteSVM のテストに、Token-2022 の mint を 3 種類足す。拡張なし、PYUSD と同じ拡張、許可しない拡張（NonTransferable と、フック設定済み）の 3 つである。それぞれで add_mint・initialize_task・settle・refund を流す。旧来の SPL Token の既存テストは、そのまま通ることを確かめる。

Devnet へは、v1.2 と同じ手順（12 §9）で上げる。メインネットは最初から v1.3 を載せるので、12 §10 の手順のうち `.so` の作り方と `add_mint` の対象だけを書き換える。

## 6. オフチェーン

| 場所 | 変えること |
|---|---|
| API の型 | `AssetSchema` を「台帳に載っている記号」の文字列にする。受付中かどうかはサービスで調べる（型で決めると、環境変数で開け閉めできない） |
| 依頼の作成 | 残高・小数の桁・下限・受付中かを、台帳を見て調べる。残高は通貨ごと（15 §3.3 のまま） |
| 決済ジョブ | `assetOf()` を台帳の参照に置き換える。mint とトークンプログラムは台帳から決める |
| アダプタ | 依頼の mint の持ち主に合わせて、ATA の導出と `tokenProgram` を切り替える。SOL を包む処理はそのまま |
| 入金検出 | operator の財布と、受付中の全通貨の ATA を見る。`spl-token-2022` の送金も数える。1 取引に複数の通貨があれば通貨ごとに 1 行。`deposits` の主キーを（署名, 通貨）にする |
| DB | 移行 0029: `deposits_asset_chk` を外し、主キーを（signature, asset）にする。値の検査はアプリで行う |
| 画面 | `/console` の残高と入金先、証人の稼ぎと明細、公開の統計を、通貨の一覧で回す。合計は通貨ごとで、1 つの数にまとめない |
| 入金先 | 通貨ごとに Solana Pay の URL を出す（`spl-token=<mint>`）。operator の ATA は `mainnet-setup.ts` と `devnet-setup.ts` が受付中の全通貨ぶん先に作る |
| x402 | USDC だけのまま（15 §3.3） |

証人の受け取り口座（ATA）は、これまでどおり運営者が作って rent を払う。1 口座あたり約 0.00204 SOL で、証人が新しい通貨で初めて受け取るときに 1 回かかる。通貨が増えるほどこの費用は増えるが、払い出しの取引手数料と同じく運営の費用として扱う（9 章）。

## 7. 決済の処理量

### 7.1 目標

メインネットで次を満たす。数字は切り替え後に本番の `payment_records` で測り、12 §10 の確認に足す。

- 1 回の tick が 300 秒に収まる。打ち切りで貸し出し期限切れを待つジョブを出さない
- 50 件の一括依頼が、作成から 3 分以内に全件 FUNDED になる
- 混雑時でも、blockhash 切れによる再試行を 1 割未満にする

### 7.2 ジョブを並列に流す

tick の最後の段（ジョブを流す段）を、最大 `JOB_CONCURRENCY` 件（既定 6）を同時に流す形にする。

- 各ワーカーが `leaseNextJob` で 1 件借り、終わったら次を借りる。借りる処理は `for update skip locked` なので、同時に借りても同じジョブは取らない
- tick の開始から 200 秒を過ぎたら、新しく借りない。流れているジョブは最後まで待つ。1 件は最長でも口座作り＋settle の 2 回 × 60 秒なので、300 秒に収まる
- 1 回の上限 `maxJobs` は 20 から 60 に上げる

同じ依頼を同時に触ることは無い。ジョブは依頼ごとに重複キーがあり、状態の書き込みは `lockTask` の行ロックの中で行う。チェーン側も、PDA の `init` が二重の資金化を拒む。

並列にして新しく起きうるのは、SOL の依頼 2 件が同時に wSOL 口座の残高を読み、足りない分を少なく見積もる場合だけである。このとき後の 1 件は残高不足で失敗し、再試行で包み直して通る。お金は動かず、遅れるのも 1 回の再試行ぶんだけなので、排他は入れない。

RPC の呼び出しは並列数に比例して増える。Helius Developer の上限（`docs/ops/rpc-mainnet-2026-10-13.md`）に対して、6 並列なら余裕がある。

### 7.3 1 件を速くする

- **口座作りの取引は `confirmed` まで待てばよい。** ATA を作る命令は冪等で、取り消されても次の settle が口座の不足で失敗し、作り直すだけである。お金の動く settle は、これまでどおり `finalized` を待つ
- **blockhash は `confirmed` で取る。** 有効期間を最初から約 7 秒失うのをやめる
- **優先手数料を混み具合で決める。** `getRecentPrioritizationFees` に書き込む口座（operator・treasury・task）を渡し、直近の 75 パーセンタイルを使う。下限は今の 10,000、上限は環境変数 `PRIORITY_MAX_MICROLAMPORTS`（既定 1,000,000）。RPC が答えなければ下限を使う
- **計算量の上限を命令ごとに決める。** LiteSVM のテストで測った消費量の 1.3 倍を `setComputeUnitLimit` で渡す。既定の 1 命令 20 万よりずっと小さくなり、優先手数料の総額も下がる
- **取り込まれるまで再送する。** 送ってから 2 秒ごとに同じ取引を送り直し、取り込まれるか blockhash が切れるまで続ける（署名が同じなので二重には実行されない）

### 7.4 変えないこと

お金の動く取引が `finalized` になるまで、DB で「払った」と書かない（06 §5.1）。tick は毎分の呼び出しのまま、依頼の直後に流す `kickAfter` もそのまま残す。

## 8. 作業の順番

| PR | 中身 | お金 | 移行 |
|---|---|---|---|
| 1 | この設計書 | 動かない | なし |
| 2 | 決済の処理量（7 章）。並列数の既定 6 | 動かない（流れ方だけ変わる） | なし |
| 3 | 通貨の台帳と金額の桁（3・4 章）、`GET /v1/assets`、`check-assets.ts`。`ASSETS_ENABLED` の既定は USDC だけ | 動かない | なし |
| 4 | オフチェーンの多通貨化（6 章）。入金・画面・決済ジョブ・アダプタ | 動かない | 0029 |
| 5 | プログラム v1.3（5 章）とテスト。Devnet へ配置し、試験用の mint 2 つを登録して一周する | Devnet だけ | なし |
| 6 | 手順書。12 §9・§10 を v1.3 と多通貨に合わせ、`mainnet-setup.ts` が受付中の全通貨を `add_mint` する | 動かない | なし |

PR 2〜4 は、既定値のままなら本番の動きが変わらないことを確かめてからマージする。PR 4 の移行 0029 は、コードより先に本番へ当てる。

## 9. まだ決めていないこと

- **メインネットで最初に開く通貨。** 私の案は USDC・SOL・USDT・PYUSD の 4 つで始め、残りは依頼者から求められたら開くことである。安定通貨を先に揃えておけば、依頼者は値動きを気にせず報酬を決められる。JUP・BONK などの値動きの大きい通貨は、証人が受け取った時点で価値が変わる。そのことを画面で伝えてから開く
- **発行元を信頼する範囲。** PYUSD と USDG は、発行元（Paxos）が永続委任で vault の中身を動かせる。USDC の凍結権と同じ種類の信頼だと考えて台帳に載せるが、運営者の判断として記録する
- **証人の口座代。** 通貨ごとに約 0.00204 SOL を運営者が払う。通貨が増えても証人 1 人あたりの上限は台帳の通貨の数までで、当面は費用として受け入れてよいと考える。依頼が増えたら手数料（15 §6）と一緒に決め直す
- **x402 を USDC 以外に広げるか。** `exact` 方式は SPL トークンの送金なので、USDT や PYUSD にも広げられる。需要が見えてから決める
