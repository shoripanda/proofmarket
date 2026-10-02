# ProofMarket 実装設計書・要件定義書（日本語・正本）

作成日: 2026-10-02
対象: Crypto World's Fair 2026 提出版（締切 2026-10-12）
英語版: [`../en/00-README.md`](../en/00-README.md)（日本語版の対訳。食い違ったら日本語版が正しい）

## この文書群の役割

`specs/proofmarket/` の既存仕様 14 本は「何を満たすか」を定め、技術選定と実装の細部を実装側に委ねている。この文書群はその委ねられた部分を埋め、Claude Code がこれだけを見て P0 から実装に入れる状態を作る。

既存仕様の P0 要件・セキュリティ/プライバシー制約・受け入れ基準は一つも弱めていない。既存仕様に曖昧な点や矛盾があった箇所は、解釈を決めて下の「既存仕様の穴と解決」に記録した。

優先順位は既存の `specs/proofmarket/README.md` の Precedence に従う。

1. `AGENTS.md` のセキュリティ・プライバシー・実装原則
2. `requirements.md`
3. `acceptance-criteria.md`
4. `api-contract.md`
5. この文書群（data model / architecture と同列。既存の data model / architecture より具体的な場合はこちらを使う）

## 読む順番

| # | ファイル | 中身 |
|---|---|---|
| 1 | [01-requirements-definition.md](01-requirements-definition.md) | 要件定義書。範囲、ロール、業務フロー、機能・非機能要件、曖昧点の決定 |
| 2 | [02-system-architecture.md](02-system-architecture.md) | 基本設計。技術スタック、構成、リポジトリ構成、画面一覧、環境変数 |
| 3 | [03-state-machine.md](03-state-machine.md) | タスク・クレーム・提出・資金の状態遷移表 |
| 4 | [04-database-design.md](04-database-design.md) | PostgreSQL のテーブル定義と制約 |
| 5 | [05-api-design.md](05-api-design.md) | REST / MCP / Webhook の詳細とエラーコード一覧 |
| 6 | [06-solana-program-design.md](06-solana-program-design.md) | Anchor プログラムと Settlement Adapter |
| 7 | [07-evidence-verification-design.md](07-evidence-verification-design.md) | 撮影から判定・合意・evidence root までの処理 |
| 8 | [08-security-privacy-operations.md](08-security-privacy-operations.md) | 脅威と対策の対応、鍵管理、保持期間、障害時の手順 |
| 9 | [09-test-plan.md](09-test-plan.md) | テスト計画と受け入れ基準の対応表 |
| 10 | [10-implementation-plan.md](10-implementation-plan.md) | 10/2〜10/12 の日程、作業分割、人間の担当 |
| 11 | [11-code-skeleton.md](11-code-skeleton.md) | 設計とコードの対応表、骨組みの検証結果、開発環境の準備 |

## 決定事項一覧

ユーザー確認済みの決定には「確認済」と書いた。それ以外は設計判断で、理由は各章にある。

| ID | 決定 | 根拠・確認 |
|---|---|---|
| D-01 | 全体を TypeScript で統一する。Next.js（App Router）で worker 用 Web と `/v1` REST API を一つのアプリにまとめ、Vercel に置く | 確認済（TypeScript 一式） |
| D-02 | DB とオブジェクトストレージは Supabase（PostgreSQL + Storage の private bucket）。ORM は Drizzle | 02 章 |
| D-03 | Solana プログラムは Anchor 1.2 系（Rust）、TS クライアントは `@anchor-lang/core`、プログラムのテストは LiteSVM | 06 章。2026-10-02 時点の安定版 |
| D-04 | worker のログインと受取ウォレットは Privy。初回ログインで Solana の埋め込みウォレットを自動作成し、worker はトランザクションに一度も署名しない | 確認済（アプリが自動発行） |
| D-05 | requester（エージェント）は API キーで認証する。Solana の秘密鍵は持たせない。資金はプラットフォームが預かる前払い残高方式（Devnet 限定） | 05・06 章。本番で同じことをするには法務確認が要る |
| D-06 | 報酬資産は Circle の Devnet USDC（mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`、小数 6 桁）。faucet が足りなければ自前のテスト mint に切り替える | 06 章 |
| D-07 | `bounty.amount` は witness 1 人あたりの額。エスクロー総額は `amount × required_witnesses` | 01 章 4 節 |
| D-08 | 判定を通った提出（valid）はすべて支払う。合意できなかった場合や期限切れでも同じ。判定で落ちた提出には払わない | 01 章 4 節 |
| D-09 | クレーム（枠の確保）とチャレンジ（nonce の発行）を分ける。nonce は現地で撮影を始めるときに発行し、有効期間は `freshness.max_age_seconds` | 07 章 |
| D-10 | 状態はタスクのライフサイクル、資金（funding / settlement）、結果（outcome）の 3 軸で持つ。`VERIFIED_PENDING_SETTLEMENT` は「VERIFIED かつ settlement.status = PENDING」で表す | 03 章 |
| D-11 | 結果の確定（finalize）にはオンチェーンの時間制限を設けない。RPC 障害が長引いても、valid な提出をした worker への支払いを失わないため | 06 章 |
| D-12 | 非同期処理はトランザクショナル outbox で行う。リクエスト内で即時に一度実行し、Supabase の pg_cron が毎分 `/api/internal/tick` を呼んで残りを拾う | 02 章 |
| D-13 | evidence root と result hash は RFC 8785（JSON Canonicalization Scheme）で正規化した JSON の SHA-256 | 07 章 |
| D-14 | 写真はアプリ内カメラ（`getUserMedia`）で撮る。端末のギャラリーからは選ばせない。サーバーで再エンコードして EXIF を落とす | 07 章 |
| D-15 | worker は招待制のクローズドパイロット。対象地域は設定値の矩形で絞る | 01 章 |
| D-16 | 成果物は日本語を正本とし、英語版を対訳として置く | 確認済 |
| D-17 | 実装は Claude Code が主に担い、人間は worker 役・現地検証・動画・ピッチを担当する | 確認済。10 章 |

## 既存仕様の穴と解決

| # | 既存仕様の状態 | 解決 | 該当章 |
|---|---|---|---|
| G-01 | `requirements.md` のライフサイクルは CLAIMED / SUBMITTED をタスクの状態として並べているが、複数 witness ではクレームが複数あり、タスク 1 本の状態では表せない | タスクの状態は「どこまで進んだか」を表す単調な状態と定義し、個々の進行はクレーム・提出側の状態で持つ | 03 |
| G-02 | `architecture.md` の `VERIFIED_PENDING_SETTLEMENT` が状態一覧にない | 状態を増やさず、settlement.status の軸で表す（D-10） | 03 |
| G-03 | キャンセル可能な状態が「explicit state rules」とだけ書かれ、中身がない | 「進行中のクレームが 0 件かつ valid な提出が 0 件」の間だけキャンセルできる | 01・03 |
| G-04 | `api-contract.md` の Idempotency 対象に fund があるが、fund の API がない | fund は内部処理にした。冪等性は PDA の一意性と payment_records の一意制約で担保する | 05・06 |
| G-05 | bounty が総額か 1 人あたりか書かれていない | 1 人あたり（D-07） | 01 |
| G-06 | UNCLEAR 回答・合意不成立・期限切れ時の支払いが未定義 | D-08 のとおり | 01・07 |
| G-07 | `onchain-data-model.md` は finalize に「期限前であること」を求めるが、RPC 障害が期限をまたぐと正当な提出が確定できなくなる | finalize の時間制限をオンチェーンでは外す。期限の判定はオフチェーンで提出を受け付けた時点に行う。refund は Funded のときしか呼べないので、確定済みのタスクが返金されることはない（D-11） | 06 |
| G-08 | claim の応答に nonce を含めるが、鮮度 300 秒だと現地に着く前に切れる | チャレンジ再発行 API を足す。claim 応答の nonce は互換のため残す（D-09） | 05・07 |
| G-09 | API の `network: "solana-devnet"` は x402 V1 のネットワーク名と同じ表記 | 自前 API の列挙値としては残す。x402 V2 を実装するときは CAIP-2 表記（`solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`）に変換する | 05 |
| G-11 | `onchain-data-model.md` は worker の公開鍵を「決済に必要なら」置いてよいとする。一方、受取アドレスはタスクをまたいで同じなので、Explorer を見れば同じ worker がどの店にいつ行ったかを結び付けられる | MVP はクローズドパイロットで、worker にこの点を説明して同意を取る。API は公開鍵を返さない。本番ではプラットフォームが残高を持ってまとめて払い出す方式に変える（P2） | 06・08 |
| G-12 | `offchain-data-model.md` は依頼の位置を「暗号化または制限」とする | 平文で持ち、アクセスを制限する。位置は worker に見せる公開店舗の位置で、運営者が登録した許可リストの地点に限るため（G-14） | 04 |
| G-13 | Webhook のイベントに、資金拘束に失敗したキャンセルを知らせるものがない | `verification.cancelled` を追加する（既存 7 種類はそのまま） | 05 |
| G-14 | `privacy-security.md` は MVP の対象を公開された場所に限るとするが、それを確かめる仕組みが既存仕様にない | 運営者が登録した店舗の許可リスト（`places`）を持ち、依頼の位置がその地点から 30 m 以内でなければ断る | 04・05・08 |
| G-10 | ルート README のディレクトリ方針は `app/`・`backend/`・`programs/` を分けている | Next.js 1 本に worker 画面と API をまとめるため `apps/web` とし、ドメインロジックは `packages/` に出す。README は実装着手時に更新する | 02 |

## 人間に決めてもらう残りの事項

実装は以下が未定でも進められる。値は設定ファイルに外出ししてある。

1. パイロット地域（市区町村と対象の店舗 3〜5 か所）。現地テストの 10/6 までに要る
2. Privy・Supabase・Vercel・RPC プロバイダ（Helius など）のアカウント作成と API キーの発行。10/3 までに要る
3. テスト worker（2 名以上）とテスト requester（2 名以上）の依頼先
4. AI による画像整合チェック（P1、任意）を使うかどうか。使う場合は Claude API の費用が少しかかる
