# AGENTS.md

このリポジトリは ProofMarket（AI エージェントが自分ではできないことを人に頼み、証拠つきの答えを受け取るための仕組み）を設計・実装・運用するための共同作業領域である。

ChatGPT、Codex、Claude Code、OpenClaw、その他 AI エージェントは、作業開始時にこのファイルを読み、以下のルールに従うこと。

## 1. 最初に読むファイル

原則として次の順番で読む。

1. `README.md`
2. `docs/proofmarket-concept-2026-10-02.md`（製品の構想と wedge）
3. `specs/proofmarket/README.md` と、そこに書かれた read order の仕様一式
4. `specs/proofmarket/implementation/ja/`（実装設計書。ja が正本、en は訳）
5. `docs/solana-research-2026-09-11.md`（Solana の技術メモ。必要なときだけ）

ProofMarket を実装・変更する場合は、**`specs/proofmarket/README.md` とそこから参照される仕様一式を必ず読むこと。**

## 2. リポジトリの目的

目的は「Solanaを使うこと」ではない。

**実在する社会課題を、既存手段より良く解決できる場合に限ってSolanaを採用し、調査 → 仮説 → PoC → MVP → 実運用へ進めること。**

## 3. 必ず行う反証

新しいアイデアや機能を提案するとき、必ず以下を検討する。

1. 本当に社会課題が存在するか。
2. 誰が困っているか。
3. 既存サービス・制度で十分ではないか。
4. PostgreSQL等の通常DBだけでは不足する理由は何か。
5. permissioned ledgerの方が適切ではないか。
6. public blockchainが必要なら、なぜSolanaなのか。
7. 利用者がwalletやSOLを意識しないUXにできるか。
8. 個人情報・企業秘密をon-chainに置かず設計できるか。
9. network outage時のfallbackが必要か。
10. 日本の法令・行政制度・業界規制と両立するか。

「blockchainだから透明」「Solanaだから高速」のような一般論だけで採用理由としない。

## 4. 出典ポリシー

### 社会課題・制度・統計

優先順位:

1. 日本国政府・省庁・自治体
2. 独立行政法人・公的研究機関
3. 国際機関
4. 大学・査読論文
5. 信頼性の高いシンクタンク
6. 企業の一次資料（競合サービス自身の実績確認等）

### Solana技術

優先順位:

1. Solana公式documentation
2. Solana Foundation / official network research
3. Solana whitepaper / protocol specification
4. validator client / proposal等の一次資料
5. 査読論文・国際機関研究

一般ニュース、SEOメディア、価格予想サイト、匿名ブログ等を重要事実の唯一の根拠にしない。

## 5. 数字の分類

市場調査の数字を混同しない。必ず以下のどれかとして扱う。

- `MARKET_SIZE`: 当該製品・サービス市場そのもの
- `INDUSTRY_SCALE`: 対象産業全体
- `PROBLEM_SCALE`: 社会的損失・影響額
- `TRANSACTION_SCALE`: 取引量・取扱量
- `AID_SCALE`: 支援資金量
- `ADOPTION`: users / companies / participants

例:

- 食品ロスによる経済損失4兆円 = `PROBLEM_SCALE`
- 医薬品国内出荷12.8兆円 = `INDUSTRY_SCALE`
- Circular economy 80兆円 = `INDUSTRY_SCALE`

これらをそのまま「当サービスのTAM」と書かない。

## 6. On-chain dataの原則

公開チェーンには原則として必要最小限のproof/stateだけを置く。

推奨:

- hash
- pseudonymous identifier
- signature
- state transition
- timestamp / slot
- settlement state
- entitlement / voucher state

原則禁止:

- 氏名
- 住所
- 電話番号
- メール
- マイナンバー関連情報
- 医療情報
- 避難所・被災状況等の機微情報
- 企業秘密
- 契約書本文
- 大容量raw data

## 7. 製品の主仮説

汎用 gig marketplace ではなく、**AI agent が物理世界の fresh fact を人間へ検証依頼し、machine-readable result を得る Reality Verification Network**。MVP の中心は `PLACE_STATUS_VERIFICATION`。2026-10-04 に、店の外から確かめられる `QUEUE_LENGTH`・`NOTICE_POSTED` を API キーごとの許可制で追加した（`specs/proofmarket/implementation/ja/01-requirements-definition.md` 4.8 節）。同日、オーナーの判断で、本・紙資料・実物・電話など人の手が要る作業まで広げた（17 種類、数値と文章の答え、場所の省略、店舗の許可リストの廃止。同 4.15 節）。2026-10-08 に、依頼者が仕事の「形」も決められるようにした（複数項目の答え `form`、受け取りの条件 `acceptance_criteria`、場所を問わない依頼の締切 7 日、一括依頼 `POST /v1/verifications/batch`。同 4.25 節。17 種類は見本の位置づけ）。raw photo / GPS は off-chain、Solana は settlement / attestation の最小レイヤーとする。

## 8. 現時点の優先順位

**2026 年秋の Colosseum Crypto World's Fair（締切 2026-10-12）に向けて、本番（https://proofmarket.fun）を動かしながら仕上げる。** 実装判断は `specs/proofmarket/requirements.md` と `specs/proofmarket/acceptance-criteria.md` を優先する。要件を変えるときは `specs/proofmarket/implementation/ja/01-requirements-definition.md` を先に直す。

## 9. 新規調査を保存するとき

ファイル名には必要に応じて基準日を付ける。

例:

- `docs/solana-research-2026-09-11.md`
- `docs/agent-clients-check-2026-10-04.md`

各調査には最低限、以下を含める。

1. 調査基準日
2. 結論
3. 事実
4. 推論・仮説
5. 出典URL
6. 不確実性
7. 次に確認すべきこと

**事実とアイデアを明確に分けること。**

## 10. 仕様策定時の標準ファイル

実装候補に昇格したプロジェクトは、次を作る。

```text
specs/<project>/
├── problem.md
├── users-and-stakeholders.md
├── requirements.md
├── architecture.md
├── onchain-data-model.md
├── offchain-data-model.md
├── privacy-security.md
├── legal-checklist.md
├── competitor-differentiation.md
├── mvp-plan.md
└── kpi.md
```

## 11. 実装原則

- blockchain部分を最小化する。
- business logicの全てをon-chainへ置かない。
- idempotency、replay protection、double-spend対策を明示する。
- devnet/local validatorで検証してからmainnetを検討する。
- private keyをrepositoryへcommitしない。
- `.env`、secret、API key、seed phraseをcommitしない。
- 利用者へSOL保有を強制しないUXを優先する。
- fee sponsorship / embedded wallet / passkey等を検討する。
- 法規制未確認のasset/tokenを発行しない。

## 12. 競合調査のルール

「類似サービスがある = アイデアを捨てる」ではない。

次の順で評価する。

1. 同じ課題を解決しているか。
2. 同じ顧客が支払うか。
3. 同じworkflowか。
4. blockchainを使っているか。
5. どのchain / architectureか。
6. 実証実験かproductionか。
7. adoptionはどの程度か。
8. 既存サービスの何を置換せず、何を補完できるか。

可能な限り「競合」だけでなく「integration partner候補」としても評価する。

## 13. READMEとの関係

READMEはリポジトリの入口・概要として簡潔に保つ。調査・運用メモ・提出資料は`docs/`、仕様は`specs/`へ置く。

AIエージェントが新しい重要文書を追加した場合、必要に応じてREADMEまたは関連indexからリンクする。

## 14. 現在の基準日

Solana 仕様の技術メモの基準日は **2026-09-11**。ProofMarket の仕様・競合・法務チェックの基準日は **2026-10-02**。

将来の作業では、時間依存する数字・制度・Solana network仕様は必ず最新の一次資料で再確認すること。