# ProofMarket アーキテクチャ設計書（2026-10-14）

オーナーの指示書「Solana Foundation 公式テンプレートを活用したアーキテクチャ設計・開発指示書」に沿って、既存コードと [solana-foundation/templates](https://github.com/solana-foundation/templates) を調べ、設計をまとめた。**この文書群は設計だけで、本番コードは変えていない。** 実装は、オーナーが 11 章のロードマップを承認してから始める。

結論を先に書く。ProofMarket の土台（Next.js と Supabase、Anchor のエスクロー、Privy の埋め込みウォレット、x402 の窓口、MCP）はすでに動いており、公式テンプレートで置き換えるべき層はない。採り入れる価値があるのは、テンプレートが示す**型**のほうで、具体的には (1) 支払い前に条件を見せて承認を取る型（eve-pay）、(2) 署名鍵を KMS や MPC に逃がす署名インターフェース（nextjs-keychain）、(3) IDL から型つきクライアントを生成する型（nextjs-anchor の Codama）、(4) ChatGPT の画面に結果を描くウィジェット（solana-chatgpt-kit）の 4 つである。いちばん急ぐのは、依頼者の支出上限が DB にあるのに検査されていない点の修正と、メインネットで実際のお金を持つ operator 鍵の置き場の見直しで、どちらもテンプレートではなく設計の問題として 08 章と 11 章に書いた。

| # | 文書 | 何が書いてあるか |
|---|---|---|
| 01 | [現行システム](01-current-system.md) | 機能ごとの実装状況（Implemented / Partial / Missing / Unknown）と、コードで確かめた事実 |
| 02 | [テンプレート分析](02-template-analysis.md) | 6 本の優先テンプレートと、関係の深い 3 本の調査結果。採用・部分採用・不採用の表 |
| 03 | [目標アーキテクチャ](03-target-architecture.md) | 構成図と、いまの作りから変える点・変えない点 |
| 04 | [Agent API 仕様](04-agent-api-specification.md) | 認証、API キー、レート制限、権限、冪等性、足りない一覧 API |
| 05 | [エスクロー設計](05-escrow-design.md) | Anchor プログラムの口座と命令、二重払いの防止、鍵の分離 |
| 06 | [決済設計](06-payment-design.md) | 前払い残高、x402、入金検出、支出上限、処理量 |
| 07 | [成果物検証設計](07-verification-design.md) | 機械検査、AI 審査、人の審査、異議。AI だけで不可逆な支払いをする危険の評価 |
| 08 | [セキュリティ設計](08-security-design.md) | 脅威ごとの対策、鍵管理、緊急停止、支出の歯止め |
| 09 | [データベース設計](09-database-design.md) | 39 表の役割、制約で守っていること、足す表 |
| 10 | [移行計画](10-migration-plan.md) | 互換性を保ったまま変える順番と、戻し方 |
| 11 | [実装ロードマップ](11-implementation-roadmap.md) | Phase 1〜5 の作業、依存、難易度、完了条件 |
| 12 | [RentAHuman の調査](12-rentahuman-benchmark.md) | rentahuman.ai の作りと、ProofMarket をそちらへ寄せる設計・決めごと D1〜D6 |

2026-10-15 にオーナーが実装を承認し、11 章 §10 の 8 件を決めた（同節に記録）。同日に Phase 3・1〜2・4 とウィジェットを PR #44〜#47 として出し、各変更は既存仕様の章（01 §4.29〜4.30、04 §3.28〜3.29、05 §1.2/§2.1b/§2.2a/§6.1、06 §5.x、08 §5〜6、12 §10.3、15 §4.2）に追記した。

既存の正本は `specs/proofmarket/implementation/ja/`（00〜16 章）で、この文書群はそれを置き換えない。ここで決めた設計は、実装のときに該当する章へ追記する。

調査の方法は次のとおり。ProofMarket は `origin/main`（コミット `05d6544`、PR #37 まで）を読み、未マージの PR #39〜#42（多通貨と並列決済）は「審査中」として区別した。templates は 2026-10-11 のコミット `d7961ba` を clone し、README・AGENTS.md・TEMPLATES.md と各テンプレートの package.json・README・主要ソースを読んだ。npm の公開日と各ディレクトリの最終コミット日は 2026-10-14 に GitHub API と npm registry で確かめた。
