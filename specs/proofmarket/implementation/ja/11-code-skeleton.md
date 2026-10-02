# 11. コードの骨組み

作成日: 2026-10-02

00〜10 章の設計を、実装の土台になるコードに落とした。型・スキーマ・DB 定義・プログラムのアカウント構造・API の入口・テストの名前までがそろっていて、処理の中身は書いていない。中身のある関数は `NOT_IMPLEMENTED (PR-xx)` を投げ、仮の API は 501 を返す。どの PR で埋めるかは 10 章 3 節に従う。

## 1. 設計とコードの対応

| 設計 | 正となるコード | 備考 |
|---|---|---|
| 状態の値（03 章） | `packages/core/src/domain/enums.ts` | タスク・資金・結果・クレーム・提出・チャレンジ・アップロードの全状態 |
| 遷移表 T01〜T18（03 章 2.2 節） | `packages/core/src/task/transitions.ts` | 表をデータで持つ。条件（guard）と副作用（effect）も名前つきで列挙 |
| 上限値・保持期間（01 章 4 節、04 章 4 節） | `packages/core/src/domain/limits.ts` | |
| エラーコード（05 章 8 節） | `packages/core/src/errors.ts` | HTTP ステータスと retryable を含む |
| API の入出力（05 章） | `packages/core/src/schemas/api.ts`（zod） | ここから `packages/core/openapi.json` を生成する（`pnpm openapi`） |
| 判定・合意・evidence root（07 章） | `packages/core/src/verification/*`、`packages/core/src/evidence/bundle.ts` | 関数の型と、判定の順番 |
| ポリシー規則（08 章 3 節） | `packages/core/src/policy/rules.ts` | 規則 ID は確定。禁止語の一覧は PR-03 で入れる |
| DB（04 章） | `packages/db/src/schema.ts`、`packages/db/drizzle/*.sql` | Drizzle で書けないもの（追記専用トリガー、RLS、フラグの初期値）は `0001_custom.sql` |
| Solana プログラム（06 章） | `programs/proofmarket/src/**` | アカウント・PDA・各命令のアカウント検査・エラー・イベントまで。命令の処理本体は PR-09 |
| IDL | `packages/solana/idl/proofmarket.json` | `anchor build` の出力をコミットする。CI で差分を検査 |
| Settlement Adapter（06 章 4〜5 節） | `packages/solana/src/adapter.ts` | outbox ジョブが呼ぶメソッドの契約 |
| requester SDK・MCP（05 章 6 節） | `packages/sdk`、`packages/mcp` | MCP のツール説明文は確定 |
| API の入口（05 章 1.1 節） | `apps/web/app/v1/**/route.ts`、`apps/web/app/api/internal/tick` | 23 本。各ファイルの先頭に節番号と担当 PR |
| サービス層 | `apps/web/lib/services/*`、`apps/web/lib/auth/*` | 関数の型と処理手順のコメント |
| 画面 W-01〜W-08、公開結果ページ（02 章 5 節） | `apps/web/app/(worker)/**`、`apps/web/app/r/[id]` | 中身は仮の文言 |
| 運用スクリプト | `scripts/*.ts` | 使い方のコメントだけ |
| CI（09 章 4 節） | `.github/workflows/ci.yml` | |

## 2. 骨組みの段階で動いているもの

| 確認 | 結果 |
|---|---|
| 全 7 パッケージの型検査（`pnpm typecheck`） | 通る |
| lint（`pnpm lint`、Biome） | 通る |
| `next build` | 通る。API 23 本と画面のルートを認識 |
| 仮の API の応答 | `POST /v1/verifications` が 501 と仕様どおりのエラー形式を返す |
| `anchor build` | 通る（警告なし）。IDL に命令 6・アカウント 2・エラー 15・イベント 4 |
| `cargo test -p proofmarket` | P 層の 15 件がすべて `ignore`（中身は PR-09） |
| 遷移表の形の検査 | T01〜T18 がそろい、未知の状態・イベント・条件を参照していない。SETTLED と REFUNDED から出る遷移がない |
| エラー形式（U-ERR-01） | 全コードが `code`・`message`・`retryable`・`details` を持つ |
| 移行 SQL を PGlite に適用 | 24 テーブル。支払いと返金の排他（I-SET-03・04 の DB 側）、戻しと返金の排他、quorum の範囲、状態名の制限、監査ログの追記専用が効く |

テストの雛形は 09 章の ID をそのまま名前にしている（`it.todo` と Rust の `#[ignore]`）。実装時はこの名前のテストを埋めていけば、受け入れ基準との対応が崩れない。

## 3. 骨組みを作る中で決めたこと

| 決定 | 理由 | 反映先 |
|---|---|---|
| サーバー側の Privy は `@privy-io/node` を使う | `@privy-io/server-auth` が非推奨になっていた | 02 章 1 節、05 章 1.2 節 |
| `verification_requests.place_id` を追加 | 照合した許可リストの地点を記録し、後から監査できるようにする | 04 章 3.4 節 |
| lint と整形は Biome、TypeScript は 5.9 に固定 | 設定が 1 ファイルで済む。TypeScript 7 は Next.js との組み合わせが未検証 | 02 章 1 節、10 章 3 節 |
| 環境変数 `APP_ENV` を追加 | 開発用の決済スタブを demo 環境で起動させないため | 02 章 6.2 節、`.env.example` |
| オンチェーンのトークンは従来の SPL Token（Token-2022 ではない） | Circle の Devnet USDC が従来の SPL Token のため | `programs/proofmarket` |
| `update_config` の mint と treasury を別の引数にする | Anchor の IDL がタプル型を扱えない | `programs/proofmarket/src/instructions/update_config.rs` |
| プログラム ID は `A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s` | `anchor build` で生成。鍵は `~/.config/proofmarket/proofmarket-program-keypair.json` に控え、リポジトリには入れない | `Anchor.toml`、`lib.rs` |

## 4. 開発環境の準備

```bash
# 必要なもの: Node.js 24 以上、pnpm 12、Rust（rustup）、Solana CLI（Agave 4.x）、Anchor CLI 1.2.0（avm）
pnpm install
cp .env.example apps/web/.env.local      # 値を埋める。コミットしない
pnpm typecheck && pnpm lint && pnpm test
pnpm openapi                              # schemas/api.ts を変えたら再生成してコミット
pnpm db:generate                          # schema.ts を変えたら移行 SQL を生成してコミット
anchor build && cp target/idl/proofmarket.json packages/solana/idl/
pnpm build                                # Next.js
```

Devnet の鍵（admin・operator・verifier・プログラム）は `~/.config/proofmarket/` に置く。`.gitignore` は鍵ファイル・`.env*`・`target/` を除外している。

## 5. 次にやること

骨組みは 10 章の PR-01 と、PR-02・PR-09 の一部（スキーマ、アカウント構造）にあたる。次は PR-02（ID 生成・DB 接続・監査ログ）と PR-03（遷移の評価とポリシー規則）を埋め、雛形のテストを通していく。

実装に入る前に、オーナーに用意してもらうものは 00 章の末尾のとおり。Supabase と Privy のアカウントは PR-04・05 の前に要る。
