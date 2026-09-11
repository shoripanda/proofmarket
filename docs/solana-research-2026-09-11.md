# Solana 技術調査メモ

調査基準日: **2026-09-11**

## 調査方針

Solanaの仕様・性能・リスクについて、Solana公式ドキュメント、Solana Foundation、原著ホワイトペーパー、公式Changelog / Upgrade trackerなどの一次資料を優先して整理する。

## 1. 基本構造

SolanaはPermissionless Layer 1 blockchainで、高スループット、低手数料、低遅延の実行環境を目指して設計されている。

### Proof of History（PoH）

PoHはコンセンサス方式そのものではない。連続的な暗号学的計算によってイベントの順序と時間経過を検証可能にする仕組みで、validator間の時間・順序に関する調整を削減することを狙う。

現在のSolanaはProof of StakeとTower BFTを用いてコンセンサスを形成する。

### Accounts

Solanaは状態をAccountに保存する。公式Core Conceptsでは、Accountは32-byte addressをキーとするkey-value storeとして説明されている。

### Programs

SolanaのスマートコントラクトはProgramと呼ばれ、sBPFへコンパイルされる。Program自体は原則としてstatelessで、mutable stateはInstructionで渡されるdata account側に保持される。

### Transaction / Instruction

InstructionはProgramの呼び出し単位で、複数Instructionを1つのTransactionにまとめられる。Transactionはatomicに処理される。

## 2. 並列実行

SolanaではTransactionがアクセスするAccountをあらかじめ明示する。このため、互いに同じwritable accountを競合して使用しないTransactionは並列処理できる。

社会課題向けサービスとの関係では、以下のような多数の独立イベントを扱うシステムと相性がよい可能性がある。

- 移動サービスの乗車証明
- 小口バウチャー利用
- リサイクル回収イベント
- 食品寄附・受渡し証明
- 物流のcustody transfer
- インセンティブ配布

## 3. 手数料

2026-09-11時点のSolana公式Fees documentationでは、基本手数料は原則**5,000 lamports / signature**。

また、optional priority feeを追加できる。

fee payerを別主体に設定できるため、自治体やサービス運営者が利用者のtransaction feeをスポンサーするUXも構築可能。これにより、一般利用者がSOLを保有していなくてもサービスを使える構成を設計できる。

## 4. 2026年の主なネットワーク変更

### 100M CU Blocks

2026年7月、MainnetでSIMD-0286がactivateされ、block limitが**60M Compute Unitsから100M Compute Units**へ引き上げられた。

### 300ms target slot time

2026年8月28日、Mainnetでtarget slot timeを**300ms**へ短縮するfeature gateがactivateされた。

### V1 Transactions

V1 Transactionではmaximum transaction sizeを**1,232 bytesから4,096 bytes**へ拡張する計画。

ただし、2026-09-11現在はまだMainnet activation前であり、公式upgrade trackerでは**2026-09-15 01:20 UTC**のactivation予定とされている。

### Alpenglow

SolanaはTower BFTを次世代consensus protocolである**Alpenglow**へ置き換える計画を進めている。

Alpenglow Phase 1ではVotor voting algorithmを導入し、約**150ms finality**を目標としている。

2026-09-11現在、Alpenglow consensus自体はMainnetで未稼働。公式upgrade trackerではAgave 4.3、2026年10月ごろの導入が予定されている。

将来Phase 2では、block propagationについてTurbineからRotorへの移行が想定されている。

## 5. Network health と分散性

Solana Foundationの2025年6月Network Health Reportでは、2025年4月16日時点として以下が報告されている。

- Consensus validators: 1,295
- Nakamoto Coefficient: 20
- Validator clients: 3

ただし、これはFoundation自身による2025年時点の報告であり、2026年現在のリアルタイム値としては扱わない。

validator clientの多様化は、同一software bugによるnetwork-wide failure riskを減らす上で重要。Agaveに加え、Firedancer / Frankendancer系の実装が進められている。

## 6. 過去の障害

2024-02-06、Solana Mainnet Betaは約5時間block finalizationが停止した。

公式outage reportによると、LoadedProgramsに関係するlegacy loaderの挙動によって無限recompile loopが発生し、当時95%以上のcluster stakeが該当バージョンを利用していたため、多くのvalidatorが同時に停止してconsensusがhaltした。

社会インフラ用途では、Solanaだけをsingle point of failureにしないことが重要。

例:

- 一時的なoff-chain queue
- 再送処理
- offline voucher / QR fallback
- chain recovery後のreconciliation
- read model / local cache

## 7. 社会課題サービスで使いやすいSolanaの性質

### A. 低コストで多数のイベントを記録できる

物流、交通、食品、リサイクルなど、1件あたりの価値が小さく件数が多い用途に向く可能性がある。

### B. 複数主体が同じ履歴を検証できる

自治体、企業、市民、NPO等が同じサービスに参加する場合、単一事業者が管理するDBとは異なるaudit layerを提供できる。

### C. Programによるルールの自動化

用途限定voucher、利用期限、reward、escrow、settlement等をProgramで実装できる。

### D. fee sponsorship

利用者に暗号資産の知識やSOL保有を要求しないUXを構築できる。

## 8. 社会課題用途での注意点

### 個人情報を直接オンチェーンに置かない

公開blockchainは履歴が広く検証可能である。氏名、住所、医療情報、避難情報、本人確認資料、企業秘密などは原則off-chainに置く。

推奨パターン:

- on-chain: hash / status / timestamp / pseudonymous identifier / settlement
- off-chain: actual records / PII / sensitive business data

### Oracle problem

Blockchainは「入力された記録が改ざんされにくい」ことを提供できるが、「入力された事実が現実世界で正しい」ことを自動的には保証しない。

そのため、QR、NFC、IoT sensor、行政認証、事業者署名、複数主体attestation等と組み合わせる必要がある。

### 法制度

tokenを発行する場合、設計によっては資金決済法、金融商品取引法その他の規制検討が必要になる。公共分野では個人情報保護、行政情報システム、調達、業界固有規制も確認する。

## 9. 主要一次資料

- Solana Whitepaper: https://solana.com/solana-whitepaper.pdf
- Solana Core Concepts: https://solana.com/docs/core
- Solana Programs: https://solana.com/docs/core/programs
- Solana Fees: https://solana.com/docs/core/fees
- Solana Fee Abstraction: https://solana.com/docs/payments/send-payments/payment-processing/fee-abstraction
- Solana Upgrades: https://solana.com/upgrades
- Solana Changelog: https://solana.com/changelog
- 100M CU Blocks changelog: https://solana.com/news/solana-changelog-july-30-2026
- 300ms Mainnet changelog: https://solana.com/de/news/solana-changelog-august-27-2026
- Alpenglow: https://solana.com/id/upgrades/alpenglow
- Agave 4.2 overview: https://solana.com/uk/upgrades/agave-4-2-release-overview
- 2024-02-06 outage report: https://solana.com/news/02-06-24-solana-mainnet-beta-outage-report
- Network Health Report June 2025: https://solana.com/id/news/network-health-report-june-2025

## 10. 今後の追加調査

- Alpenglow / Votorの原論文・formal specification
- Firedancer architecture
- Token-2022を社会インフラ用途で使う際の機能・制約
- ZK / confidential transferの実運用可能性
- Solanaの長期運用コスト
- RPC / indexer architecture
- 日本法上のtoken、voucher、stablecoin利用条件
