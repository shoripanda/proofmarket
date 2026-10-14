# 02. テンプレート分析: 置き換える層はない。採るのは 4 つの「型」

作成: 2026-10-14 ／ 対象: [solana-foundation/templates](https://github.com/solana-foundation/templates) コミット `d7961ba`（2026-10-11）／ npm の版と公開日は 2026-10-14 時点

## 1. 目的

指示書の第 2・第 4 段階に当たる。優先テンプレート 6 本（kit/nextjs、kit/nextjs-anchor、solana-chatgpt-kit、x402-template、eve-pay、phantom-embedded-react）を実物で確かめ、ProofMarket で再利用できるかを判定する。名前から機能を推測しないため、各テンプレートの package.json・README・主要なソースを読んだ。あわせて、調べるうちに関係が深いと分かった 3 本（kit/nextjs-keychain、community/kit-node-solanax402、community/supabase-auth）も扱う。

## 2. 現状: リポジトリの全体像

templates は `create-solana-dapp` の素材集で、MIT ライセンス（ルートの LICENSE）である。グループは kit（`@solana/kit` 系 10 本）、web3js（8 本、うち 6 本は legacy）、mobile（6 本）、community（21 本）に分かれ、`templates.json` と `TEMPLATES.md` は `pnpm generate` で作られる。AGENTS.md は AI エージェント向けの作業規約で、「ウォレットや取引を自動化するテンプレートは、認証・権限・利用者の承認の境界を明記せよ」と求めている。

保守の状態は、公式（kit）と community で差がある。`docs/agents/known-gotchas.md` によれば、テンプレートの自動テスト（`test-templates.yml`）は community を対象から外している。2026-10 に加わった `pnpm health`（インストール・ビルド・依存の鮮度を機械で確かめる）は全テンプレートを見るが、community の中身が動くかどうかは保証されない。

6 本の最終コミット日と、依存の鮮度は次のとおり。

| テンプレート | 最終コミット | 主な依存（テンプレートの指定 → npm の最新） | ライセンス |
|---|---|---|---|
| kit/nextjs | 2026-10-02 | `@solana/kit` ^7.0.0 → 8.5.0、`@solana/surfpool` ~1.5.0 | MIT |
| kit/nextjs-anchor | 2026-09-10 | `@solana/kit` ^6.3.0 → 8.5.0、`anchor-lang` 1.1.2、`litesvm` 0.10.0、Codama 1.10.0 | MIT |
| community/solana-chatgpt-kit | 2026-09-10 | `x402-solana` ^0.1.1 → 3.0.1、`mcp-handler` 1.1.0 → 2.3.0、`@modelcontextprotocol/sdk` 1.26.0 | MIT |
| community/x402-template | 2026-09-10 | `x402-next` ^1.1.0 → 1.2.0（最終公開 2026-04-16）、`viem` ^2.38.5 | MIT（README） |
| community/eve-pay | 2026-07-14 | `eve` 0.22.5 → 0.79.0、`ai` 7.0.22、`@solana/addresses` 6.9.0 | 記載なし（ルートの MIT に従う） |
| community/phantom-embedded-react | 2026-09-10 | `@phantom/react-sdk` ^2.0.2 → 2.0.4、`@solana/web3.js` ^1.95.0 | ISC（package.json） |

最終コミットが 2026-09-10 で揃っているのは、Next.js を 16.3.4 に上げる一括 PR（#463）のためで、中身の更新ではない。eve-pay は 7 月の初回コミット以来触られておらず、依存の `eve` は 0.22 から 0.79 まで進んでいる。

## 3. 要件（判定の基準）

指示書の表の列に従う。対象機能、現在の実装、再利用可能性（高・中・低）、必要な変更、依存関係、セキュリティリスク、推奨対応（採用・部分採用・不採用）。「採用」はコードを取り込むこと、「部分採用」は設計や一部の実装の型を取り入れること、「不採用」は参考にとどめることを指す。既存コードとの互換性を最も重く見る。

## 4. 提案する設計（テンプレートごとの判定）

### 4.1 kit/nextjs: 不採用（テストの型だけ参考にする）

`@solana/kit` v7 と `@solana/react` で、ブラウザのウォレットを wallet-standard で見つけ、SOL 送金・SPL トークンの作成と送金・メモを `client.sendTransaction([instruction])` の 1 行で送る見本である。クラスタ切り替え、残高の表示、Explorer リンクつきのトースト、エラーの読み替え（`parseTransactionError`）を含む。

差は 2 点ある。第一に、利用者がブラウザのウォレットを持たない。worker は Privy の埋め込みウォレットで一度も署名せず、エージェントは API キーか x402 で入ってくる。ウォレット接続の部品に使い道がない。第二に、`@solana/kit` への移行は `@anchor-lang/core` 1.2 が web3.js v1 を前提にする間は部分的にしかできず、型が二重になる（既存仕様 02 §1 が退けた理由と同じ）。

参考になるのはテストの作りで、`@solana/surfpool` をプロセス内で起動し、本物のウォレット発見と署名の経路を jsdom で通している。いまは `solana-test-validator` を手で立てて localnet テストを流しており（CLAUDE.md の台帳に起動直後の不安定さの記録がある）、Surfpool に替えれば CI でも本物に近い往復を回せる可能性がある。ただし Surfpool は Rust 製のネイティブアドオンで、Anchor 1.2 の SBPF v3 の `.so` を読めるかは未確認である（11 章 Phase 1 の調査項目）。

| 項目 | 内容 |
|---|---|
| 対象機能 | ウォレット接続、送金、エラー表示、テスト基盤 |
| 現在の実装 | 接続は Privy、送金はサーバー側の web3.js v1、テストは PGlite と localnet |
| 再利用可能性 | 低（接続・送金）、中（テスト基盤） |
| 必要な変更 | 取り込まない。Surfpool は調査のうえ判断 |
| 依存関係 | `@solana/kit` 7〜8 系、`@solana/surfpool`（ネイティブ） |
| セキュリティリスク | 無し（クライアント側の見本） |
| 推奨対応 | 不採用 |

### 4.2 kit/nextjs-anchor: 部分採用（Codama によるクライアント生成）

Anchor の vault プログラム（SOL を自分の PDA に入れて引き出すだけ、Rust 70 行）と、その IDL から Codama で `@solana/kit` 向けの型つきクライアントを生成する流れ（`codama.json`、`app/generated/vault/`）を示す。wallet-standard の署名を `TransactionModifyingSigner` に包む `signer.ts` は、ウォレットが取引を書き換えて返す場合に署名と本文の不一致を防ぐ工夫で、丁寧に書かれている。Cargo の release プロファイル（`overflow-checks = true`、`lto = "fat"`）は ProofMarket の `Cargo.toml` と同じである。

vault プログラムそのものは ProofMarket のエスクロー（命令 8 本、Config PDA、LiteSVM テスト 23 本。Token-2022 対応は PR #42 で審査中）に比べて単純すぎ、取り込むものはない。価値があるのは Codama である。いま `packages/sdk/src/onchain.ts`（公開結果ページがブラウザからチェーンを照合する部分）は web3.js v1 で Task 口座を手で読んでいる。Codama で IDL から kit 用のクライアントを生成すれば、ブラウザ側だけを軽い `@solana/kit` に寄せられ、サーバー側の Anchor クライアントはそのまま残せる。IDL は CI で一致を確かめているので、生成物も同じ検査に載せられる。

| 項目 | 内容 |
|---|---|
| 対象機能 | プログラムと Web の連携、PDA、エスクロー |
| 現在の実装 | `@anchor-lang/core` の `Program` と手書きの PDA 関数（`packages/solana/src/pda.ts`） |
| 再利用可能性 | 中 |
| 必要な変更 | `codama.json` を足し、`packages/sdk/onchain` の読み取りを生成クライアントに替える。サーバー側は変えない |
| 依存関係 | `codama` 1.10、`@codama/nodes-from-anchor`、`@codama/renderers-js`、`@solana/kit`（ブラウザのみ） |
| セキュリティリスク | 低。生成物は読み取り専用に使う |
| 推奨対応 | 部分採用（Phase 1） |

### 4.3 community/solana-chatgpt-kit: 部分採用（ChatGPT のウィジェット）

ChatGPT の Apps SDK 向けに MCP サーバー（`mcp-handler`）を Next.js に置き、Jupiter の交換、SOL 送金、残高、ステーキングを自然言語で動かす。道具ごとに HTML ウィジェットを MCP リソースとして登録し、`openai/outputTemplate` のメタデータで ChatGPT の画面に描かせる。ウォレットは 2 方式で、サーバーに秘密鍵を置く方式（`SOLANA_PRIVATE_KEY`）と、ブラウザのウォレットに署名させる方式がある。後者では送金 API に `x402-solana` で 0.001 USDC の手数料を課し、検証は PayAI の facilitator に委ねる。ヘッダーは x402 v1 の `X-PAYMENT` である。

MCP はすでに HTTP で公開され（OAuth 2.1、道具 8 本）、ChatGPT と claude.ai のコネクタとして動いている。したがって MCP の実装は要らない。x402 も既存のほうが進んでおり、v2 のヘッダー、自前の facilitator、仕様の MUST の全検証を持つ。秘密鍵をサーバーに置く方式は指示書が禁じる形なので採らない。

採る価値があるのは、ChatGPT に結果の画面を描かせる型である。いま `get_reality_verification` は JSON を返し、証明ページ（`/r/[id]`）へのリンクを含む。Apps SDK のウィジェットにすれば、写真の判定結果と証明ページを ChatGPT の中に出せる。ただし Apps SDK のメタデータは OpenAI 固有で、claude.ai には効かない。需要が見えてから足す。

| 項目 | 内容 |
|---|---|
| 対象機能 | AI エージェントと Solana の接続、道具の呼び出し、権限 |
| 現在の実装 | リモート MCP（`apps/web/app/mcp`、`packages/mcp`）、x402 v2 |
| 再利用可能性 | 低（MCP・x402）、中（ウィジェット） |
| 必要な変更 | MCP リソースにウィジェットの HTML を足す。`mcp-handler` は使わず既存の `@modelcontextprotocol/sdk` で書く |
| 依存関係 | 追加なし（Apps SDK のメタデータは文字列） |
| セキュリティリスク | ウィジェットは iframe で動く。秘密を含めない |
| 推奨対応 | 部分採用（Phase 3、任意） |

### 4.4 community/x402-template: 不採用

`x402-next` の `paymentMiddleware` でページに支払いの門を付ける見本である。宛先、ネットワーク（`solana-devnet`）、facilitator（`https://x402.org/facilitator`）、Coinbase Developer Platform のクライアントキーを環境変数で与え、Coinbase Pay の画面で人が払う。型は EVM 向けの `viem` の `Address` を流用している。README には CDP のクライアントキーがそのまま書かれており、見本としての注意が要る。

既存の x402 とは利用者が違う。このテンプレートは**人がブラウザで**払う流れで、セッション Cookie を発行する。こちらは**エージェントがプログラムで**払う流れで、支払いが依頼そのものの認証になる。さらに `x402-next` 1.2.0 の最終公開は 2026-04-16 で、Coinbase の x402 は同じ時期に `@x402/core`・`@x402/svm`（2.28 系、2026-09 公開）へ移っている。古い方の系統に乗る理由がない。

| 項目 | 内容 |
|---|---|
| 対象機能 | x402、HTTP ベースの決済、USDC 支払い、支払い検証 |
| 現在の実装 | `POST /v1/x402/verifications`（v2、自前 facilitator） |
| 再利用可能性 | 低 |
| 必要な変更 | 無し |
| 依存関係 | `x402-next`（保守が止まりつつある）、`viem`、CDP のキー |
| セキュリティリスク | 外部の facilitator と CDP に依存。README に鍵の直書き |
| 推奨対応 | 不採用 |

### 4.5 community/eve-pay: 部分採用（承認の門と事前照合の型）

Vercel の Eve（エージェントの実行基盤）で、HTTP 402 の支払い条件を読み、人の承認を待ってから Pay.sh のサンドボックスで払う見本である。名前に x402 とあるが、使っている手順は MPP（`WWW-Authenticate` ヘッダーに base64url の条件を入れる方式）で、x402 ではない。仕組みは小さく、`inspect_stock_quote` が条件（額、mint、宛先、ネットワーク）を取り出し、`buy_stock_quote` が `approval: always()` で必ず人を止め、承認後にもう一度条件を取り直して 1 つでも違えば払わない。README の「本番に進むときの境界」は実用的で、毎回の承認か別途審査した支出ポリシー、宛先・額・mint・ネットワーク・手数料支払者の表示と検証、上限と宛先の許可リストをコードで持つこと、支払いに冪等キーを使うこと、確定をチェーンで確かめること、署名権限を KMS か MPC に置くこと、を挙げる。

払われる側である ProofMarket でも、同じ型が 2 箇所で効く。1 つは `scripts/x402-agent.ts`（見本のエージェント）で、402 を受け取ってそのまま払う。条件を表示して承認を待ち、送る前に条件を取り直す形に直すと、見本としての教育効果が上がる。もう 1 つは MCP の道具で、`request_reality_verification` は呼ばれた時点で残高を引き当てる。費用を先に返して確認を取る「見積もり → 確定」の 2 段階を設けると、エージェントの実行基盤（Eve や Claude の承認機能）が人を止めやすくなる（04 章）。Eve 自体は採らない。エージェントを動かす側ではないからである。

| 項目 | 内容 |
|---|---|
| 対象機能 | エージェントの決済、支払い権限、承認、支出上限、不正利用防止 |
| 現在の実装 | 見本エージェントは承認なしで払う。MCP は呼ばれた時点で引き当てる |
| 再利用可能性 | 中（型のみ） |
| 必要な変更 | 見本エージェントの承認と事前照合、MCP の見積もり段階、支出上限の検査（08 章） |
| 依存関係 | 追加なし |
| セキュリティリスク | 無し。むしろ下げる |
| 推奨対応 | 部分採用（Phase 3） |

### 4.6 community/phantom-embedded-react: 不採用（代替候補として記録）

Phantom の埋め込みウォレット SDK（`@phantom/react-sdk` 2.0）で、Google・Apple・Phantom・ブラウザ拡張の 4 通りからログインし、Solana のアドレスを得る見本である。`PhantomProvider` に appId と redirectUrl を渡すだけで、画面は接続ボタンと残高表示にとどまる。README には Phantom の MCP サーバー（`@phantom/mcp-server`、道具 28 本）の案内があり、Claude Desktop からウォレットを操作できる。

worker 側の要件（メールか Google でログインし、ウォレットを意識させず、署名させない）は Privy で満たしており、Phantom に替えても worker 体験は変わらない。移行には worker 全員のウォレットの付け替えが要り、支払い履歴の宛先も変わる。採らない。ただし、Privy の価格や方針が変わったときの代替候補として、同じ埋め込みウォレットの型であることを記録しておく。

もう 1 つの接点は依頼者側で、Phantom の MCP サーバーを持つ Claude なら、x402 の支払い取引をその場で署名できる。ProofMarket の `/developers` ページで接続方法の 1 つとして案内する価値はある（Phase 3、文書のみ）。

| 項目 | 内容 |
|---|---|
| 対象機能 | ウォレット認証、接続状態、セッション、モバイル対応 |
| 現在の実装 | Privy（`@privy-io/react-auth` 3.46） |
| 再利用可能性 | 低 |
| 必要な変更 | 無し |
| 依存関係 | `@phantom/react-sdk`、Phantom Portal の appId |
| セキュリティリスク | 移行時にウォレットの付け替えが要る |
| 推奨対応 | 不採用 |

### 4.7 追加で調べた 3 本

**kit/nextjs-keychain: 採用候補（Phase 2〜5）。** `@solana/keychain` 2.0 の `SolanaSigner` という 1 つのインターフェースの裏に、ローカル鍵、HashiCorp Vault、AWS KMS、GCP KMS、Turnkey、CDP、Privy、Fireblocks、Dfns、Para、Crossmint、Openfort、Utila の 13 の署名バックエンドを置き、環境変数だけで切り替える。鍵はブラウザに出ず、サーバーの Route Handler が署名だけを行う。これは指示書の「秘密鍵をサーバー上に無防備に保存しないこと」と、15 §4.2 の operator 鍵の課題に直接答える。制約は、`SolanaSigner` が `@solana/kit` の `TransactionPartialSigner` を拡張しており、ProofMarket の web3.js v1 の `Keypair` とは型が違う点である。ただし署名の対象は取引のバイト列なので、`VersionedTransaction.serialize()` した本文を kit の形に変換して署名を受け取る薄い橋で足りる（05 章と 08 章）。テンプレートの署名 API に認証が無い点は README 自身が注意している。

**community/kit-node-solanax402: 不採用。** Express の facilitator とサーバーを分けた x402 の実装で、SOL の送金と自前の nonce による再送防止を持つ。既存の実装は facilitator を同じプロセスに持ち、再送防止は取引 ID（手数料支払者の署名）を主キーにした `x402_payments` で行っている。構成を分ける理由はいまのところない。

**community/supabase-auth: 不採用。** Supabase の Web3 認証でウォレット署名によりログインする。ウォレット署名を認証に使わない方針（`api-contract.md`）があり、Supabase の Auth も使っていない。

## 5. 技術選定の理由（判定のまとめ）

| テンプレート | 判定 | 理由の要点 |
|---|---|---|
| kit/nextjs | 不採用 | 利用者がブラウザのウォレットを持たない。kit 移行は Anchor クライアントに阻まれる |
| kit/nextjs-anchor | 部分採用 | Codama でブラウザ側の読み取りクライアントを生成できる |
| solana-chatgpt-kit | 部分採用 | ChatGPT のウィジェットの型だけ。MCP と x402 は既存のほうが進んでいる |
| x402-template | 不採用 | 人向けの流れで、依存の系統が古い |
| eve-pay | 部分採用 | 承認の門と事前照合の型を見本エージェントと MCP に移す |
| phantom-embedded-react | 不採用 | Privy で足りる。代替候補として記録 |
| nextjs-keychain | 採用候補 | operator 鍵を KMS や MPC に逃がす署名インターフェース |
| kit-node-solanax402 | 不採用 | facilitator を分ける理由がない |
| supabase-auth | 不採用 | ウォレット署名での認証は方針で退けている |

テンプレートを使うこと自体を目的にしない、という指示書の最重要指示に照らすと、コードをそのまま取り込むものは 1 本もない。これは ProofMarket が 10 月 2 日からの 12 日間で既にテンプレート相当の層を作り終えているためで、テンプレートの価値は「公式がどの境界を守れと言っているか」の確認にある。

## 6. 代替案

- `@solana/kit` へ全面移行する案。Anchor 1.2 の TS クライアントが web3.js v1 を要求するため、エスクローの送信部分を手書きに戻す必要があり、いまは割に合わない。Anchor が kit 対応のクライアントを出した時点で再評価する
- `x402-next` や `x402-solana` の npm パッケージに検証を置き換える案。既存の自前実装は仕様の MUST を網羅し、テストがある。外部パッケージの版の揺れ（`x402-solana` は 0.1 から 3.0 まで 1 年で進んだ）を受けるほうが危ない
- Phantom の埋め込みウォレットに替える案。4.6 のとおり退ける

## 7. セキュリティ上の考慮事項

テンプレートから学ぶべき境界は AGENTS.md の一文に集約される。「エージェント、MCP、ウォレット、取引の自動化のテンプレートは、認証・権限・利用者の承認の境界を明記せよ」。ProofMarket の `/developers` と MCP の道具の説明は、費用がいつ引き当てられるかを明記していない（推測: 利用者は `request_reality_verification` を呼んだ時点で残高が減ることを知らない）。04 章でこの境界を文書と API の両方に書く。

テンプレートの依存を取り込む場合の注意は 2 点ある。community の依存は固定されていないものが多く（`x402-solana` ^0.1.1）、`pnpm install` した時点で README と違う版になる。もう 1 点は Surfpool のようなネイティブアドオンで、`pnpm-workspace.yaml` の `allowBuilds` に明示しないと postinstall が止まる（CLAUDE.md の台帳 2026-10-02）。

## 8. 実装上の課題

- Codama の生成物は `biome` の整形対象から外すか、生成後に整形するかを決める（IDL と同じく CI で一致を確かめる）
- `@solana/keychain` と web3.js v1 の橋は小さいが、署名の前後で取引のバイト列が変わらないことをテストで固定する
- Apps SDK のウィジェットは ChatGPT の開発者モードが要り、手元で確かめるにはトンネルが必要（CLAUDE.md の台帳 2026-10-03 に HMR の注意がある）

## 9. テスト方針

採り入れる 4 つの型それぞれに、既存のテスト層で受ける場所がある。Codama の生成クライアントは `packages/sdk/test/onchain.test.ts` の偽口座で、keychain の橋は `packages/solana/test/send.test.ts` の偽 RPC と localnet で、MCP の見積もり段階は `apps/web/test/mcp-http.test.ts` で、見本エージェントの承認は `apps/web/test/x402.test.ts` の 402 往復で確かめる。

## 10. 未決定事項

- Surfpool を CI の localnet 代わりに使うか（SBPF v3 の読み込み可否が未確認）
- ChatGPT のウィジェットを作るか（需要が未確認）
- keychain のバックエンドをどれにするか（AWS KMS、GCP KMS、Privy のサーバーウォレット、Turnkey のどれも ProofMarket では未検証。費用と Vercel からの到達性で決める）
