# 10. 実装計画（10/2〜10/12）

作成日: 2026-10-02

## 1. 進め方

Claude Code が実装を担い、人間（以下「オーナー」）はアカウントの用意、worker・requester の手配、現地テスト、動画とピッチを担う（D-17）。`mvp-plan.md` のマイルストーンに日付を合わせ、Level A を壊す作業は後回しにする。

毎日の終わりに、その日の PR が CI を通って main に入り、demo 環境で動いている状態にする。翌日に持ち越すのは未着手の作業だけにする。

## 2. 日程

| 日付 | マイルストーン | Claude Code | オーナー |
|---|---|---|---|
| 10/2（金） | M0 仕様凍結 | この設計書一式 | 設計書のレビュー、残りの決定事項（00 章）への回答 |
| 10/3（土） | 土台 | PR-01〜03 | Privy・Supabase・Vercel・Helius のアカウントと API キー。パイロット地域の決定 |
| 10/4（日） | M1 一本通し | PR-04〜06 | 自分のスマートフォンで 1 件通す（チェーンなし） |
| 10/5（月） | M2 判定 | PR-07・08 | worker 2 名・requester 2 名に依頼して日程を押さえる。店舗 3〜5 か所を選ぶ |
| 10/6（火） | Solana プログラム | PR-09・10 | Devnet の SOL と USDC を operator に入れる。現地で判定の失敗パターンを試す |
| 10/7（水） | M3 Solana 接続 | PR-11・12 | Explorer で取引を確認。デモの台本の初稿 |
| 10/8（木） | M4 エージェント連携 | PR-13・14（Level A に問題がなければ） | MCP を Claude Desktop などから試す |
| 10/9（金） | M5 実利用 | 不具合の修正、理由文と画面の手直し | 実利用 3 件以上、記録表の記入 |
| 10/10（土） | M5 実利用 / M6 準備 | 修正、README とアーキテクチャ図の更新、記録表からの集計 | 実利用の残り（合計 5 件以上）、ピッチ資料 |
| 10/11（日） | M6 提出物 | デモ用データの確認、リンクの点検 | ピッチ動画・技術デモ動画（各 3 分未満）、スクリーンショット |
| 10/12（月） | 提出 | 提出後の不具合対応 | 提出、全リンクの確認 |

## 3. PR の分け方

| PR | 内容 | 依存 | 完了の条件 |
|---|---|---|---|
| PR-01 | モノレポの土台（pnpm、Next.js、`packages/*`、ESLint、Vitest、CI、gitleaks、`.gitignore`） | — | CI が緑。空の `/v1/health` が demo 環境で返る |
| PR-02 | DB スキーマとマイグレーション、seed、ID 生成、エラー形式 | PR-01 | `pnpm db:migrate` が Supabase に当たる。U-ERR-01 |
| PR-03 | `packages/core` の状態遷移表とポリシー規則 | PR-01 | U-SM-ALL、U-SM-CAN、U-POL-* |
| PR-04 | requester API（作成・取得・キャンセル）、API キー認証、冪等性、上限、店舗の許可リスト、`scripts/issue-api-key.ts`・`register-place.ts` | PR-02・03 | I-IDEM-01・02、I-LIM-01、I-RACE-03、I-CRT-05・06 |
| PR-05 | worker 認証（Privy）、登録、一覧、詳細、クレーム、チャレンジ、放棄、画面 W-01〜05 | PR-02・03 | 実機でログインからクレームまで |
| PR-06 | アップロード、提出、最小の判定（nonce・ジオフェンス・鮮度）、画面 W-06〜07、開発用の決済スタブ | PR-04・05 | M1 の完了条件（人が 1 件通す） |
| PR-07 | 判定一式（media・replay・理由文）、画像処理、audit_events、outbox（リース方式）と tick | PR-06 | D2〜D6 の I 層テスト、I-OUT-01 |
| PR-08 | 合意の算出、結果の組み立て、evidence バンドルと root | PR-07 | U-CON-*、U-JCS-01 |
| PR-09 | Anchor プログラム（全命令）と LiteSVM テスト | PR-01 | P 層全部 |
| PR-10 | Devnet デプロイ、IDL、`scripts/devnet-setup.ts` | PR-09 | Config が Devnet にある |
| PR-11 | Settlement Adapter と outbox ジョブ（FUND / FINALIZE_AND_SETTLE / REFUND）、起動時の安全確認 | PR-08・10 | I-FLOW-01・04、I-RPC-01・02、I-IDEM-03、I-FUND-01、I-SET-02〜05、D8〜D10 |
| PR-12 | 公開結果ページ、支払い履歴（W-08）、`scripts/demo-agent.ts` | PR-11 | M3 の完了条件（Explorer で見える） |
| PR-13 | MCP サーバーと `packages/sdk` | PR-04 | MCP クライアントから作成・取得 |
| PR-14 | 複数 witness（`MAX_WITNESSES` を 5 に）、dHash、Webhook | PR-11 | I-FLOW-02・03、I-WH-01 |

開発用の決済スタブ（PR-06）は local と preview でだけ動き、demo 環境で有効にすると起動時に失敗するようにする。スタブの結果がデモに混ざる余地を残さない。

## 4. 遅れたときの判断

| 状況 | 判断 |
|---|---|
| 10/8 の時点で Level A が通っていない | PR-13・14 を止め、Level A に全員で戻る |
| Privy の組み込みで 1 日以上詰まる | worker に自分の受取アドレスを入力してもらう方式に切り替える（オーナーに確認してから） |
| Circle の faucet で USDC が足りない | 自前のテスト mint に切り替える（06 章 6 節） |
| iOS で `getUserMedia` が動かない | `<input capture>` に切り替え、`fallback_capture` の印を付ける |
| 10/7 の終わりにプログラムが Devnet で動かない | 非常手段として、SPL Memo で evidence root を記録し、treasury から worker へ直接送金する。エスクローは無くなり、二重支払いと返金の排他は DB の一意制約（04 章 3.14 の `settle_xor_refund`）と I-SET-03・04 のテストだけで守ることになる。提出物でもそのとおりに説明する |
| worker が集まらない | オーナーと知人で 2 名を確保し、件数を盛らずにそのまま報告する |

## 5. 提出時に分けて書くこと

`acceptance-criteria.md` E 節に従い、提出の説明では次の 4 つを分けて書く。

- 実装したもの
- テストで確かめたもの（テスト ID と結果）
- パイロットの実績（記録表の件数と中央値。模擬を含めない）
- 今後の作業（Mainnet に必要な法務確認、早期確定、評判、分散した検証など）
