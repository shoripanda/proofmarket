# Solana-idea

Solanaを活用して日本を中心とする社会課題の解決につながるサービスを発想・検証し、そのアイデアを実際のプロダクトへ落とし込むための研究・設計・実装リポジトリです。

このリポジトリは**人間だけでなく、ChatGPT / Codex / Claude Code / OpenClaw等のAIエージェントが同じ前提・出典・判断基準を共有して作業できるknowledge base**として運用します。

> AIエージェントは最初に [`AGENTS.md`](AGENTS.md) を読んでください。

## このリポジトリの目的

1. **社会課題の調査** — 行政機関、自治体、大学・研究機関、シンクタンク、国際機関等の信頼性が高い資料を中心に課題を特定する。
2. **Solanaを使った解決策の設計** — blockchain採用自体を目的にせず、複数主体間の信頼、監査可能性、改ざん耐性、少額・高頻度決済、デジタル証明、インセンティブ等で合理性がある場合のみ使う。
3. **競合・市場調査** — 既存サービス、行政制度、blockchain先行事例を調べ、「何が既に解決され、何がまだ空いているか」を確認する。
4. **実装** — 有望案について要件定義、architecture、Solana Program、frontend、backend、test、運用設計、MVPまで進める。

---

# Knowledge Map

## 共通調査

- [Solana技術調査 2026-09-11](docs/solana-research-2026-09-11.md)
- [日本の社会課題調査 2026-09-11](docs/japan-social-issues-2026-09-11.md)
- [競合・類似サービス・市場/課題規模調査 2026-09-11](docs/competitive-landscape-and-market-size-2026-09-11.md)
- [AIエージェント作業ルール](AGENTS.md)

## サービス案

| # | Idea | 一言でいうと | 主な既存・類似事例 | 詳細 |
|---|---|---|---|---|
| 1 | CircularTrace Japan | 製品・素材の循環履歴を企業横断で証明 | Ouranos / EU DPP・Battery Passport | [詳細](ideas/01-circulartrace-japan.md) |
| 2 | RuralRide Ledger | 自治体の交通補助を複数交通会社で共通利用・精算 | GunMaaS / 自治体交通助成 | [詳細](ideas/02-ruralride-ledger.md) |
| 3 | FoodRescue Proof | 食品寄附・受領を証明しESG/監査へ利用 | Kuradashi / Too Good To Go / food banks | [詳細](ideas/03-foodrescue-proof.md) |
| 4 | ReliefPass | 災害時の用途限定voucherと支援組織間調整 | WFP Building Blocks / UNHCR+Stellar | [詳細](ideas/04-reliefpass.md) |
| 5 | PharmaTrace Proof Layer | 医薬品物流・温度・custodyの真正性を証明 | MediLedger / FDA DSCSA / Ouranos | [詳細](ideas/05-pharmatrace.md) |
| 6 | Local Carbon Proof | 地域の小口環境行動を証明・reward | JPX carbon market / Energy Web | [詳細](ideas/06-local-carbon-proof.md) |

従来の初期案まとめ: [ideas/initial-service-ideas.md](ideas/initial-service-ideas.md)

---

# 現時点の主要な規模指標

**注意: 下記の数字は同じ意味ではありません。** 市場規模、対象産業規模、社会的損失、取引量、支援資金を混同しないでください。分類ルールは`AGENTS.md`と競合調査文書を参照。

| Idea | 参考値 | 正しい解釈 |
|---|---:|---|
| CircularTrace | 日本CE 2020年50兆円 / 2030年80兆円 / 2050年120兆円 | サーキュラーエコノミー関連産業全体の規模 |
| RuralRide | 約10兆円/年 | 交通空白による経済・社会的影響額 |
| FoodRescue | 464万t/年、経済損失約4兆円/年 | 食品ロスの課題規模 |
| ReliefPass | WFP Building Blocks累計$555M / 25M tx | blockchain人道支援の処理実績 |
| PharmaTrace | 医薬品国内出荷12兆8,160億円 | 対象産業の規模 |
| Local Carbon | JPX累計1,003,412 t-CO2、参加359者 | carbon-credit市場の取引量・参加者 |

これらを各プロダクトのTAMとしてそのまま引用しないこと。

---

# 現時点の優先順位

## 技術・政策的な独自性

1. **CircularTrace Japan**
2. **ReliefPass**
3. **RuralRide Ledger**
4. **FoodRescue Proof**
5. **PharmaTrace Proof Layer**
6. **Local Carbon Proof**

## MVPの作りやすさ

1. **FoodRescue Proof**
2. **CircularTrace Japan**
3. **Local Carbon Proof**
4. **RuralRide Ledger**
5. **ReliefPass**
6. **PharmaTrace Proof Layer**

優先順位は固定ではなく、新規調査・法改正・競合・PoC結果で更新します。

---

# 研究・開発の原則

各アイデアは次の順で反証・検証します。

1. 社会課題は実在するか。
2. 誰が困っているか。
3. 既存制度・既存サービスではなぜ十分でないか。
4. 通常の中央集権型DBだけでは不足する理由があるか。
5. blockchainを使う必要性があるか。
6. その中でなぜSolanaなのか。
7. 個人情報・機密情報をon-chainへ保存せず設計できるか。
8. 日本の法令・行政制度・業界規制と両立するか。
9. 小規模なMVPで効果を検証できるか。
10. 社会的効果をKPIで測定できるか。

> **重要:** 公開blockchainに個人情報、医療情報、住所、避難者情報、企業秘密等を直接保存しない。on-chainにはhash、pseudonymous ID、state、proof、signature、settlement等の必要最小限のみを置き、機微情報は適切なaccess controlを備えたoff-chain環境で管理する。

---

# Solana 調査概要

調査基準日: **2026-09-11**

詳細: [`docs/solana-research-2026-09-11.md`](docs/solana-research-2026-09-11.md)

Solanaは、高throughput、低transaction cost、低latencyを重視して設計されたPermissionless Layer 1 blockchainです。

重要なのは、**Proof of History（PoH）はコンセンサスそのものではない**ことです。PoHはイベントの順序と時間経過を検証可能にする仕組みで、現在のnetworkではProof of StakeとTower BFTを組み合わせて合意形成します。

### このリポジトリで重視するSolanaの性質

- Account / Program model
- 競合しないtransactionの並列実行
- 低feeでの多数event記録
- digital asset / voucher / settlement
- fee sponsorshipによるwalletlessに近いUX
- public verification
- Programによるstate transition control

### 2026-09-11時点の注意

- 2026年7月: Mainnet block limit 60M CU → 100M CU。
- 2026年8月: target slot time 300msへ短縮。
- Transaction V1の最大transaction size 4,096 bytes化は2026-09-15のMainnet activation予定で、この基準日では未完了。
- Alpenglowは約150ms finalityを目標とする次世代consensusだが、この基準日ではMainnet未稼働。
- 過去にnetwork outage実績があるため公共サービスはfallbackを設計する。

---

# 現在の設計思想

このリポジトリで最も重要な共通パターンは、**既存の行政・企業システムをblockchainで全面置換しない**ことです。

```text
Existing System / Government DB / ERP / WMS / Data Space
                         │
                         │ detailed / private data
                         ▼
                   Off-chain Layer
                         │
                         │ hash / proof / state
                         ▼
                     Solana
                         │
                         ├─ verification
                         ├─ settlement
                         ├─ voucher
                         └─ incentive
```

Solanaは「全データを保存するDB」より、**複数組織間のproof / state / settlementの共通レイヤー**として使うことを第一仮説とします。

---

# ディレクトリ方針

```text
Solana-idea/
├── README.md
├── AGENTS.md
├── docs/
│   ├── solana-research-YYYY-MM-DD.md
│   ├── japan-social-issues-YYYY-MM-DD.md
│   └── competitive-landscape-and-market-size-YYYY-MM-DD.md
├── ideas/
│   ├── 01-circulartrace-japan.md
│   ├── 02-ruralride-ledger.md
│   ├── 03-foodrescue-proof.md
│   ├── 04-reliefpass.md
│   ├── 05-pharmatrace.md
│   └── 06-local-carbon-proof.md
├── specs/          # 将来: projectごとの要件定義・設計
├── programs/       # 将来: Solana Programs
├── app/            # 将来: frontend
├── backend/        # 将来: API / off-chain DB / indexer
└── tests/          # 将来: test
```

---

# 出典ポリシー

社会課題の事実認定には原則として、日本国政府・省庁・自治体、公的研究機関、国際機関、大学・査読論文、信頼性の高いシンクタンクを優先します。競合自身の導入実績等は企業の一次資料を利用できます。

Solana仕様はSolana公式documentation、Solana Foundation、whitepaper、official upgrade/changelog、査読研究等を優先します。

一般ニュース、暗号資産系SEOメディア、価格予想サイト、無署名ブログは主要根拠にしません。

---

# 次の開発段階

実装候補を1つ選定したら、`specs/<project>/` 以下にproblem、users/stakeholders、requirements、architecture、on-chain/off-chain data model、privacy/security、legal checklist、competitor differentiation、MVP plan、KPIを作成し、その後Program / app / backend実装へ進みます。
