# 08. セキュリティ・プライバシー・運用の設計

作成日: 2026-10-02

`privacy-security.md` の脅威ごとに、どの部品のどの仕組みで止めるかを対応させる。

## 1. 脅威と対策の対応

### 1.1 悪意ある requester

| 脅威 | 対策 | 実装場所 |
|---|---|---|
| つきまとい・監視の依頼 | 種別の許可リスト、質問文の禁止語、選択肢を OPEN/CLOSED/UNCLEAR に固定、対象地域の矩形 | 05 章 2.1 の検査 5・7・10・14 |
| 危険・私的な場所へ worker を行かせる | 運営者が登録した公開店舗の許可リスト（30 m 以内でなければ断る）、半径 500m 以下、worker がいつでも放棄できる | 05 章 2.1 の検査 10a、01 章 4.4 |
| 自由記述に危険な指示を隠す | 質問文 280 文字以内、禁止語、worker 画面ではプレーンテキストとして表示（HTML として解釈しない） | `packages/core/src/policy` |
| 少額タスクの大量投入 | API キーごとのレート制限・1 件上限・日次上限・残高 | 04 章 3.2・3.19 |
| 正当な作業への支払い拒否 | requester に承認の権限がない。判定に通れば自動で支払う | 01 章 4.2 |
| 責任主体のない利用 | API キーは principal に必ず紐づく。発行はスクリプトのみ | 04 章 3.2 |

### 1.2 悪意ある worker

| 脅威 | 対策 |
|---|---|
| 古い写真 | アプリ内カメラのみ、nonce 発行からの時間制限 |
| 別の場所の写真 | ジオフェンスと精度の上限（偽装は検出できないことを明示） |
| 同じ写真の使い回し | SHA-256 の一意制約（全タスク横断）、dHash（P1） |
| 複数アカウント | 招待制、Privy のアカウント 1 つにつき worker 1 人、`payout_pubkey` の一意制約 |
| 共謀 | 複数 witness（P1）。MVP の 1 witness では防げないことを結果に `witnesses.valid = 1` として正直に出す |

### 1.3 悪意ある証拠ファイル

| 脅威 | 対策 |
|---|---|
| 巨大ファイル | 署名 URL 発行時に 8 MiB で断る。サーバーでも読み込み前にサイズを確認 |
| 壊れた画像・ポリグロット | 先頭バイトの確認、sharp の `limitInputPixels`、派生画像だけを外に出す |
| メタデータ | 再エンコードで落とす。元の EXIF は暗号化して 30 日 |
| 画像内の文字によるプロンプトインジェクション | 画像の AI 判定（任意）は列挙値だけを受け取り、合否に使わない。権限のあるエージェントの文脈に画像の文字を渡さない |

### 1.4 API への攻撃

| 脅威 | 対策 |
|---|---|
| API キーの盗用 | SHA-256 で保存、失効 API、レート制限、日次上限 |
| リプレイ・冪等キーの悪用 | 05 章 1.4。本文が違えば 409 |
| Webhook の偽装 | HMAC 署名と時刻、本文に結果を入れず GET で取り直させる |
| コールバック URL による SSRF | 事前登録制、https のみ、プライベートアドレスへの送信禁止、リダイレクト不可 |
| 他人の依頼の閲覧 | 所有者以外は 404 |
| OAuth の承認画面を真似たフィッシング | 承認画面は自ドメインだけ。接続先の名前と戻り先のホストを表示し、身に覚えがなければキーを入れないよう書く。`frame-ancestors 'none'` |
| OAuth の戻り先を使ったオープンリダイレクト | 登録済みの `redirect_uri` と完全一致のみ。不正な依頼は戻り先へ飛ばさない |
| OAuth トークンの盗用 | アクセストークンは1時間、ハッシュで保存、リフレッシュトークンは使うたびに取り替え、再利用を見つけたら接続ごと無効 |
| XSS | React の既定のエスケープ。`dangerouslySetInnerHTML` を使わない。CSP を設定 |

### 1.5 決済への攻撃

| 脅威 | 対策 |
|---|---|
| 二重支払い | オンチェーンの状態（06 章 3.1）、`payment_records` の一意制約、outbox の `dedupe_key` |
| 誤った受取人・mint | settle で ATA と mint を検査、Config の mint 許可 |
| 支払い後の返金、返金後の支払い | refund は Funded のみ、settle は Finalized のみ |
| 鍵の乱用 | operator と verifier を分ける。admin はサーバーに置かない。Mainnet の RPC では起動しない |
| クライアントへの鍵の流出 | 鍵を読むモジュールに `server-only`。ビルド後のクライアント JS に鍵の形式の文字列がないか CI で検査 |

## 2. 鍵と秘密情報

- Devnet 専用の使い捨て鍵を使う（`privacy-security.md` 7 節）。Mainnet で同じ鍵を使わない
- 鍵・API キー・`.env*` は `.gitignore` に入れ、pre-commit と CI で gitleaks を回す（`acceptance-criteria.md` A6）
- ログには API キーの先頭 8 文字・Privy のユーザー ID・`verification_id` までを出し、トークン・nonce の平文・座標・鍵は出さない。ロガーに伏せ字の規則を持たせる
- requester の API キーと Solana の署名鍵は別の仕組みで管理する

## 3. 依頼内容のポリシー検査

`packages/core/src/policy/rules.ts` に規則を ID つきで並べ、どの規則で断ったかを返す。規則の版は `policy_rule_version` として依頼ごとに記録する。

| 規則 ID | 内容 | 対応する禁止事項（REQ-T-002） |
|---|---|---|
| `TYPE_ALLOWLIST` | `PLACE_STATUS_VERIFICATION` 以外を断る | 全般 |
| `PERSON_TRACKING` | 「誰々がいるか」「後をつける」「顔」「住んでいる」などの語 | 個人の追跡・特定 |
| `PRIVATE_RESIDENCE` | 「自宅」「住所」「アパート」「マンションの部屋」など | 私邸 |
| `TRESPASS` | 「中に入って」「裏口」「立入禁止」など | 不法侵入 |
| `WEAPONS_DRUGS` | 武器・薬物・規制品の語 | 武器・薬物 |
| `SEXUAL` | 性的サービスの語 | 性的なもの |
| `PROFESSIONAL_JUDGMENT` | 診断・法律判断・投資判断を求める語 | 専門判断 |
| `HARASSMENT` | 脅し・嫌がらせの語 | 嫌がらせ |
| `DANGER` | 「台風の中」「線路」「屋根」など | 危険な行動 |
| `EVASION` | 「警察」「監視カメラを避けて」など | 法執行・アクセス制御の回避 |
| `MINORS` | 「子ども」「小学生」「学校の前」など | 子ども・未成年（`privacy-security.md` 4 節） |
| `COVERT_RECORDING` | 「気づかれずに」「隠し撮り」など | 隠し撮り |
| `IMPERSONATION` | 「客のふりをして」「店員を装って」など | なりすまし |

語のリストは日英で持つ。禁止語の照合は Unicode の正規化（NFKC）と小文字化の後に行う。

キーワード照合は抜けがあるため、MVP では次の 3 つで補う。一つ目は依頼できる位置を運営者が登録した公開店舗に限っていること（REQ-X-T-104）。二つ目は選択肢を固定していて、worker がやることは「店頭を撮って 3 択で答える」以外にないこと。三つ目は招待した requester だけが使うクローズドパイロットであることだ。質問文は requester の自由記述なので、システムの指示として解釈する場所（LLM のプロンプトなど）には一切渡さない（REQ-T-003）。

## 4. プライバシー

| データ | 集める理由 | 誰が見られるか | 保持 |
|---|---|---|---|
| worker のメールアドレス | ログイン | Privy と運営者 | アカウント存続中 |
| worker の受取アドレス | 支払い | 運営者。オンチェーンの送金には現れ、タスクをまたいで同じ値なので Explorer で結び付けられる（00 章 G-11） | アカウント存続中 |
| 一覧検索時の現在地 | 近い順に並べる | 誰も（クライアントで約 100 m に丸めて送り、保存しない） | 保存しない |
| 通知の宛先と地域（2026-10-04 追加） | 近くの新しい依頼をプッシュ通知で知らせる | 運営者のみ（宛先は暗号化）。地域は worker が選んだ「渋谷のあたり」程度で、位置は使わない | 通知を止めるか、宛先が無効になるまで |
| 提出時の位置 | ジオフェンス判定 | 運営者のみ（暗号化） | 30 日 |
| 写真（元） | 判定、障害調査 | 運営者のみ | 30 日 |
| 写真（派生） | requester への証拠提示（P1） | 依頼した requester と運営者 | 30 日 |
| 判定結果・ハッシュ | 監査 | requester、公開ページ（一部） | 1 年 |

requester に worker の位置・自宅・移動履歴を返す API はない（REQ-PR-002）。ただし受取アドレスはオンチェーンで公開されるため、プライバシーポリシーと worker 規約に「報酬の受取アドレスと、どのタスクで受け取ったかは公開ブロックチェーン上で誰でも見られる」と明記し、同意を取る。プライバシーポリシーと worker 規約は日本語で用意し、初回登録時に同意を取る（REQ-X-W-101）。

## 5. 監視とログ

- ログは JSON 1 行。`level`、`msg`、`request_id`、`verification_id`、`actor_type`、`duration_ms` を入れる
- audit_events の `event_type` は `architecture.md` 7 節の 13 種類に、`submission_rejected`・`claim_abandoned`・`operator_action` を足す
- tick の中で次を数え、しきい値を超えたら警告ログを出す: DEAD になった outbox ジョブ、PENDING のまま 10 分を超えた決済、operator の SOL 残高、treasury 残高と台帳のずれ

## 6. 障害・事故への対応

`privacy-security.md` 8 節の「できなければならないこと」と手段の対応。

| やること | 手段 | 所要時間の目安 |
|---|---|---|
| requester を止める | `POST /v1/admin/credentials/{id}/suspend` | 1 分 |
| worker を止める | `POST /v1/admin/workers/{id}/suspend`（進行中のクレームは EXPIRED に） | 1 分 |
| 新規タスクを止める | `POST /v1/admin/flags { "key": "tasks_create_enabled", "value": false }` | 1 分 |
| 決済を止める | 同じく `settlement_enabled` を false。outbox のチェーンジョブが待機する | 1 分 |
| API キーを失効させる | `POST /v1/admin/credentials/{id}/revoke` | 1 分 |
| 影響した依頼を特定する | audit_events を `actor_ref` で検索する SQL を `docs/runbook.md` に用意 | 10 分 |
| 証拠の公開を止める | `POST /v1/admin/verifications/{id}/evidence/revoke-access`、全体なら `public_evidence_enabled` を false | 1 分 |
| 店舗や写り込んだ人から削除を求められた | `/rules` のフォームで受け、`list-removal.ts` で読む。該当の依頼に `revoke-access` をかけ、必要なら元写真と派生画像を Storage から消して `--mark <id> --as handled` | 1 営業日 |
| DEAD になったジョブを再実行する | 原因を直してから `POST /v1/admin/jobs/{id}/requeue` | 5 分 |
| 鍵が漏れた | `update_config` で operator / verifier を差し替え、Vercel の環境変数を更新、旧鍵の Devnet 資金を移す | 30 分 |

`settlement_enabled` を false にしても、判定と結果の取得は続ける。VERIFIED のタスクは settlement が PENDING のまま待ち、再開後に順に処理される。

## 7. 本番に進む前に解くこと

次は MVP では扱わず、Mainnet・実資金の前に必ず解く（`legal-checklist.md`）。

- 前払い残高とエスクローをプラットフォームが預かる形が、資金決済法・暗号資産関連の規制でどう扱われるか（D-05）
- worker の報酬条件の明示（フリーランス・事業者間取引適正化等法）と、支払いの税務
- 写真に写り込んだ第三者の扱いと、削除依頼への対応手順
- 保持期間の本番値
