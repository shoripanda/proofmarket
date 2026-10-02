# 06. Solana プログラムと Settlement Adapter の設計

作成日: 2026-10-02

## 1. オンチェーンに置くもの

オンチェーンには、第三者が後から確かめられると価値のあるものだけを置く。

| 置く | 理由 |
|---|---|
| タスクごとのエスクロー口座と、拘束した額 | 報酬が実際に確保されていたことを誰でも確かめられる |
| 結果（outcome）、evidence root、result hash、確定時刻 | 結果を後から書き換えていないことの証明 |
| 受取人の公開鍵と支払額 | 支払いの宛先と額が決めたとおりだったことの証明。送金の取引にどのみち現れる |

受取人の公開鍵はタスクをまたいで同じなので、Explorer を見れば同じ worker が関わったタスクを結び付けられる。MVP ではこの点を worker に説明して同意を取り（08 章 4 節）、本番ではプラットフォームが残高を持ってまとめて払い出す方式に変える（00 章 G-11）。

置かないもの: 写真、座標、質問文、worker の ID・名前・連絡先、requester の名前、API キー（`onchain-data-model.md` 1 節、REQ-P-002・003）。タスクの識別子も `task_id_hash = SHA-256("proofmarket:task:v1:" + verification_id)` だけを置く。

MVP の判定者（verifier）はプラットフォームの鍵 1 本で、分散した検証ではない。公開結果ページとピッチでもそう説明する（`onchain-data-model.md` 4 節）。

## 2. 鍵とアカウント

### 2.1 鍵の役割

| 鍵 | 置き場所 | できること |
|---|---|---|
| admin | 手元の端末だけ（Vercel に置かない） | config の初期化・変更、プログラムのアップグレード |
| operator | Vercel のサーバー環境変数 | 手数料の支払い、treasury の所有、資金拘束・支払い・返金の実行 |
| verifier | Vercel のサーバー環境変数（operator と別） | 結果の確定（finalize）だけ |

operator と verifier を分けると、拘束済みの vault からの支払いについては、片方の鍵だけでは宛先と送金の両方を動かせない。支払い先は verifier が確定し、送金は operator が実行する。

ただし treasury は operator の所有なので、operator の鍵が漏れれば treasury に残っている資金はその鍵だけで動かせる。鍵の分離が守るのは vault の中身であって、treasury 全体ではない。Devnet の使い捨て鍵と少額の treasury で運用し、本番では treasury を別の鍵（またはマルチシグ）に分ける。

### 2.2 アカウント

```rust
#[account]
pub struct Config {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub verifier: Pubkey,
    pub bounty_mint: Pubkey,        // Devnet USDC、または自前のテスト mint
    pub treasury: Pubkey,           // operator が所有する bounty_mint の ATA
    pub max_witnesses: u8,          // 5。MAX_RECIPIENTS（= 5）を超える値は update_config で拒否
    pub paused: bool,               // true なら initialize_task を拒否
    pub bump: u8,
}
// seeds = [b"config"]

#[account]
pub struct Task {
    pub version: u8,                    // 1
    pub bump: u8,
    pub vault_bump: u8,
    pub task_id_hash: [u8; 32],
    pub requester: Pubkey,              // 資金の出し手。MVP では treasury の所有者（operator）
    pub requester_ref_hash: [u8; 32],   // SHA-256(credential_id)。requester ごとの集計用
    pub mint: Pubkey,
    pub amount_per_witness: u64,        // 最小単位（USDC なら 10^-6）
    pub required_witnesses: u8,
    pub quorum: u8,
    pub deadline: i64,                  // unix 秒
    pub status: TaskStatus,             // Funded | Finalized | Settled | Refunded
    pub outcome: Outcome,               // None | Verified | NoConsensus | InsufficientWitnesses
    pub refund_reason: RefundReason,    // None | Cancelled | Expired
    pub evidence_root: [u8; 32],
    pub result_hash: [u8; 32],
    pub recipient_count: u8,
    pub recipients: [Pubkey; 5],
    pub paid_total: u64,
    pub created_at: i64,
    pub finalized_at: i64,
    pub closed_at: i64,
}
// seeds = [b"task", task_id_hash]

// vault: SPL トークン口座。seeds = [b"vault", task.key()]、authority = task PDA
```

Task は約 430 バイトで、レント免除額はおよそ 0.0043 SOL。結果の受領証として残すため閉じない。vault は支払いか返金の後に閉じ、レントを operator に戻す。

## 3. 命令

### 3.1 一覧

| 命令 | 署名者 | 前の状態 | 後の状態 | 中身 |
|---|---|---|---|---|
| `initialize_config` | admin | （なし） | — | Config を作る |
| `update_config` | admin | — | — | operator・verifier・paused・max_witnesses（5 以下）を変える |
| `initialize_task` | operator | （なし） | Funded | Task と vault を作り、treasury から `amount × N` を vault に移す |
| `finalize_verification` | verifier | Funded | Finalized | outcome・evidence root・result hash・受取人を書く |
| `settle` | operator | Finalized | Settled | 受取人に 1 人分ずつ払い、残額を treasury に戻し、vault を閉じる |
| `refund` | operator | Funded | Refunded | 全額を treasury に戻し、vault を閉じる |

settle は Finalized からしか、refund は Funded からしか呼べず、Finalized から Funded へ戻る命令はない。Settled と Refunded からはどの命令も進めない。この 3 点で「支払いと返金のどちらか一方が 1 回だけ」がオンチェーンで成り立つ（REQ-S-002、REQ-P-004、`acceptance-criteria.md` A5）。

### 3.2 initialize_task

引数: `task_id_hash`、`requester_ref_hash`、`amount_per_witness`、`required_witnesses`、`quorum`、`deadline`

検査:

- `config.paused == false`
- 署名者 == `config.operator`
- `mint == config.bounty_mint`、`treasury == config.treasury`
- `amount_per_witness > 0`
- `1 ≤ required_witnesses ≤ config.max_witnesses`、`1 ≤ quorum ≤ required_witnesses`
- `deadline > Clock::unix_timestamp`
- `amount_per_witness × required_witnesses` を `checked_mul` で計算（あふれたらエラー）
- Task PDA が既にあれば `init` が失敗する。同じ依頼で二度拘束できない

イベント: `TaskInitialized { task, task_id_hash, amount_total, deadline }`

### 3.3 finalize_verification

引数: `outcome`、`evidence_root`、`result_hash`、`recipients: Vec<Pubkey>`

検査:

- 署名者 == `config.verifier`
- `status == Funded`
- `evidence_root` と `result_hash` が全 0 でない
- `recipients.len() ≤ required_witnesses`、重複なし、`Pubkey::default()` を含まない
- outcome ごとの受取人数:
  - `Verified`: `recipients.len() ≥ quorum`
  - `NoConsensus`: `recipients.len() ≥ quorum`（valid が揃ってから合意を出すため）
  - `InsufficientWitnesses`: `1 ≤ recipients.len() < quorum`
  - `None` は不可

finalize には時間の制限を置かない（D-11、00 章 G-07）。依頼の deadline 前に valid になった提出は、RPC 障害が何時間続いても後から確定して支払える。deadline の判定はオフチェーンで提出を受け付けた時点に済んでおり、refund は Funded のときしか呼べないので、確定したタスクが返金されることもない。

イベント: `VerificationFinalized { task, outcome, evidence_root, result_hash, recipient_count }`

### 3.4 settle

アカウント: config、task、vault、mint、treasury、operator（署名者）、token program。`remaining_accounts` に受取人の ATA を `task.recipients` と同じ順で渡す。

検査:

- 署名者 == `config.operator`
- `status == Finalized`
- `remaining_accounts.len() == recipient_count`
- 各口座が `get_associated_token_address(recipients[i], mint)` と一致し、mint と所有者も一致する
- 支払総額 `amount_per_witness × recipient_count ≤ vault の残高`

処理: 各受取人に `amount_per_witness` を送る → 残額を treasury に送る → vault を閉じる → `paid_total`・`closed_at`・`status = Settled` を書く。

イベント: `TaskSettled { task, paid_total, remainder }`

### 3.5 refund

引数: `reason`（`Cancelled` | `Expired`）

検査:

- 署名者 == `config.operator`
- `status == Funded`
- `reason == Expired` なら `Clock::unix_timestamp > deadline`

処理: vault の全額を treasury に送り、vault を閉じ、`status = Refunded` にする。

operator は Funded のタスクをいつでもキャンセル扱いで返金できる。valid な提出があるタスクを返金しないことはオフチェーンの状態遷移（03 章 T15）で守っており、オンチェーンでは強制していない。この点は、中央の判定者を信頼するという前提の一部として、公開結果ページで開示する。

イベント: `TaskRefunded { task, amount, reason }`

### 3.6 エラーコード

`Paused`、`Unauthorized`、`InvalidMint`、`InvalidTreasury`、`InvalidAmount`、`InvalidWitnessConfig`、`DeadlineInPast`、`AmountOverflow`、`InvalidStatus`、`InvalidRoot`、`InvalidRecipients`、`RecipientCountMismatch`、`RecipientAccountMismatch`、`InsufficientVaultBalance`、`NotExpired`

## 4. 取引の組み立て

| outbox ジョブ | 取引に入れる命令 | 署名者 |
|---|---|---|
| `FUND_TASK` | 優先手数料の設定、`initialize_task` | operator |
| `FINALIZE_AND_SETTLE` | 優先手数料の設定、`finalize_verification`、`settle` | verifier、operator |
| `REFUND_TASK` | 優先手数料の設定、`refund` | operator |

受取人の ATA が無ければ、`FINALIZE_AND_SETTLE` の前に `createAssociatedTokenAccountIdempotent`（支払いは operator）だけの取引を送る。ATA の作成を同じ取引に入れると、受取人が 3 人以上のとき取引サイズの上限を超えるおそれがあるためである。

finalize と settle を 1 つの取引にまとめるので、両方が成功するか両方が失敗するかのどちらかになる。結果の記録（attestation）と支払いの署名は同じ値になり、Explorer の 1 画面で両方を示せる。

## 5. Settlement Adapter（`packages/solana`）

### 5.1 送信と確認

1. 送る前に Task アカウントを読む
   - `FUND_TASK`: 既にあれば送らずに確認済みとして記録する
   - `FINALIZE_AND_SETTLE`: `Settled` なら記録だけ。`Finalized` なら、オンチェーンの outcome・evidence root・result hash・受取人を DB の結果と突き合わせ、一致したときだけ settle を送る。一致しなければ送らずにジョブを DEAD にして運営者に知らせる（verifier の鍵が漏れて別の宛先で確定された場合に、そのまま払わないため）。`Funded` なら両方送る
   - `REFUND_TASK`: `Refunded` なら記録だけ。`Finalized` / `Settled` なら返金せず、運営者に知らせる
2. 最新の blockhash を取って取引に署名し、署名を `payment_records.signatures` に追記してから送る
3. `finalized` まで待つ（上限 60 秒）。finalized になったら `CONFIRMED` にしてタスクの状態を進める
4. blockhash が失効しても取引が見つからなければ、1 に戻る。同じ署名の取引を二度数えることはない

`confirmed` ではなく `finalized` を待つのは、SETTLED と名乗った後にフォークで取り消される可能性を残さないためである（`architecture.md` 4 節）。Devnet での待ち時間は十数秒の見込みで、非機能要件の 60 秒に収まる。

### 5.2 起動時の安全確認

- RPC の `getGenesisHash` が `SOLANA_EXPECTED_GENESIS_HASH`（Devnet）と一致しなければ、Adapter は起動を拒否する（REQ-X-P-105）
- `PROGRAM_ID` の Config を読み、`bounty_mint`・`operator`・`verifier` が環境変数の鍵と一致しなければ拒否する
- operator の SOL が 1 SOL を切ったら、tick のたびに警告ログを出す

### 5.3 残高の記帳

| 時点 | requester_ledger |
|---|---|
| 依頼の作成 | RESERVE（−総額） |
| settle の確定 | RELEASE（+残額。全員に払えば 0 なので記帳しない） |
| refund の確定 | REFUND（+総額） |
| 資金拘束前のキャンセル | RELEASE（+総額） |

vault に移した資金は既に treasury を出ている。一方、作成時に RESERVE したがまだ資金拘束していない額は treasury に残っている。したがって次の式が成り立つはずである。

```text
treasury のトークン残高 = Σ 全 requester の台帳残高 + Σ 資金拘束前（funding 未確定）の依頼の RESERVE 額
```

tick の中で 1 時間に 1 回照合し、ずれたら警告する（P1）。

## 6. 報酬資産

既定は Circle の Devnet USDC（mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`、小数 6 桁）。faucet（`https://faucet.circle.com`）から operator の ATA に入れる。

faucet で必要な量が取れない場合は、`scripts/devnet-setup.ts --own-mint` で小数 6 桁のテスト mint を作り、`update_config` で `bounty_mint` を切り替える。この場合、API の `bounty.asset` は `"USDC"` のまま受け付けるが、公開結果ページと応答の `settlement` に `"test_asset": true` を出し、本物の USDC と誤認させない。

## 7. デプロイ手順

1. admin・operator・verifier の鍵を作る（`solana-keygen new`）。鍵ファイルは `~/.config/proofmarket/` に置き、リポジトリの外に出す
2. Devnet の SOL を admin と operator に入れる
3. `anchor build` → `anchor deploy --provider.cluster devnet`。アップグレード権限は admin
4. 生成された IDL を `packages/solana/idl/proofmarket.json` にコミットする
5. `pnpm tsx scripts/devnet-setup.ts` で Config を初期化し、treasury の ATA を作る
6. operator の ATA に Devnet USDC を入れる
7. `PROGRAM_ID`・`BOUNTY_MINT`・`OPERATOR_SECRET_KEY`・`VERIFIER_SECRET_KEY` を Vercel に設定する
