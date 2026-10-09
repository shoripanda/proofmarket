# CLAUDE.md

Claude Codeでこのリポジトリを扱う場合、**[`AGENTS.md`](AGENTS.md) をこのリポジトリの正本ルールとして必ず読んで従ってください。**

あわせて、作業開始前に次を確認してください。

1. `README.md`
2. `docs/proofmarket-concept-2026-10-02.md`
3. `specs/proofmarket/README.md` を開き、記載された read order に従って仕様一式を読む
4. `specs/proofmarket/implementation/ja/`（実装設計書）

このファイルと`AGENTS.md`で内容が衝突する場合は、`AGENTS.md`を優先します。


## ProofMarket implementation rule

ProofMarketではコードを書き始める前に、最低限以下を確認する。

- `specs/proofmarket/requirements.md`
- `specs/proofmarket/api-contract.md`
- `specs/proofmarket/privacy-security.md`
- `specs/proofmarket/acceptance-criteria.md`

Technology stackはClaude Code側で選定してよいが、P0 requirementsやsecurity/privacy constraintを変更する場合は、先に仕様文書側へ理由と変更を反映する。


## 失敗ルート台帳

- 2026-10-02 [Anchor 1.2 / anchor-spl] `features = ["token", "associated_token"]` だけで `token::mint` / `token::authority` 制約を使う → derive が `anchor_spl::token_interface` を参照してコンパイルエラー → `token_2022` feature も有効にする
- 2026-10-02 [Anchor 1.2 / IDL] 命令引数の構造体に `Option<(Pubkey, Pubkey)>` などのタプル型を入れる → IDL build が `Unsupported type` で失敗 → タプルをやめて別々のフィールドにする
- 2026-10-02 [TypeScript 5.9 / monorepo] `import "./x.ts"` の形で書く → TS5097 → `allowImportingTsExtensions: true`（`noEmit` と併用）を tsconfig.base.json に入れる
- 2026-10-02 [pnpm 12] 依存の postinstall（esbuild 等）が自動で止められる → `pnpm-workspace.yaml` の `allowBuilds` で許可（不要なものは false）
- 2026-10-02 [CI / gitleaks-action@v2] ワークフロー全体を `permissions: contents: read` にして PR で実行 → PR のコミット一覧 API が 403 で失敗 → secrets ジョブに `pull-requests: read` を足す
- 2026-10-02 [LiteSVM 0.10 / Anchor 1.2] `anchor build`（既定 `--arch v3`）の .so を `add_program_from_file` で読む → Agave 3.1 系の LiteSVM が SBPF v3 を読めず `InvalidAccountData` → litesvm を 0.17 に上げる（`--arch v2` なら 0.10 でも通るが、配布物と違う物を試すことになる）
- 2026-10-02 [LiteSVM 0.14] 0.10 から 0.14 に上げる → 依存が `^` 指定のため agave 4.3 系まで解決され、litesvm 自体が wincode の型エラーでコンパイル不可 → 依存を `~` で固定している 0.17 を使う
- 2026-10-02 [Anchor 1.2 / テスト] `anchor_lang::solana_program::instruction::InstructionError` を import → 存在しない → `anchor_lang::solana_program::instruction::error::InstructionError` を使う
- 2026-10-02 [手元 / cargo test] LiteSVM 入りのテストを既定の dev プロファイルでビルド → debuginfo で target/debug が 2GB を超えディスクが尽きる（No space left on device） → `CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0 cargo test -p proofmarket` で約 700MB に収まる
- 2026-10-02 [ローカル検証 / 空き容量] 空き 3.7GB の Mac で solana-test-validator（台帳上限なし）と cargo build-sbf を同時に回す → ENOSPC でディスクが満杯になり、ツール出力すら書けず作業が止まった → 着手前に `df -h` で 8GB 以上あるか確認。バリデータは `--limit-ledger-size 50000000` と scratchpad の台帳で動かし、終わったら台帳を消す。不要な `target/debug` は先に削除
- 2026-10-02 [ローカル検証 / .so] main に PR-09 を取り込んだ後も target/deploy/proofmarket.so が骨組み時代のままで、devnet-setup が `not yet implemented` で panic → ソースを取り込んだら `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml` で .so を作り直してからバリデータに載せる
- 2026-10-03 [cargo build-sbf] 素の `cargo build-sbf` が既定の platform-tools v1.54 を取りに行き、ダウンロードが途中で切れて失敗 → `--tools-version v1.57`（導入済み）を明示する
- 2026-10-03 [Next.js / @anchor-lang/core 1.2] `import { Wallet } from "@anchor-lang/core"` は Node（CJS）では動くが、Next.js が選ぶ ESM ビルドには `Wallet` が無く、ルートが 500 になる → 自前の最小ウォレット（publicKey と sign 関数）を渡す。テストが Node だけだと見逃すので、next dev / next build で実際に読み込んで確かめる
- 2026-10-03 [Next.js / シングルトン] lib/context.ts のモジュール変数で AppContext を1つにしたつもりが、API ルートとページ（RSC）が別バンドルのため2つでき、DEV_MODE では同じ PGlite ディレクトリを2インスタンスが開いて公開結果ページが空になった → globalThis に置いてプロセスで1つにする
- 2026-10-03 [Playwright / 偽カメラ] Chromium 組み込みの偽カメラ映像で e2e を繰り返す → 毎回ほぼ同じ絵のため、2回目以降はサーバーが正しく EVIDENCE_REPLAYED / EVIDENCE_NEAR_DUPLICATE で弾く → globalSetup で乱数の MJPEG を作り `--use-file-for-fake-video-capture` で流す
- 2026-10-03 [Next.js build / 確認不足] `next build 2>&1 | grep ... | head -5` で "Compiled successfully" だけを見て成功と判断した → その後の静的事前描画で /login が Privy の App ID 不足により失敗していた（CI で発覚）→ ビルドは終了コードで判定する。worker 画面は force-dynamic にし、App ID が無いときは Privy を初期化しない
- 2026-10-03 [CI / 鍵らしき文字列の検査] base58 の 87〜88 字をそのまま grep した → Privy の依存（@base-org/account）が埋め込む base64 フォントの一部と、暗号ライブラリの16進定数（16進の字は base58 にも含まれる）に当たって CI が落ちた → 前後に base64 の字が無い単独の並びだけを拾い、16進だけの並びは除く。直したら偽の鍵を置いて、まだ捕まることを確かめる
- 2026-10-03 [手元 / vitest] 負荷平均が40を超えている（Adobe の常駐が CPU を使い切る）ときに `pnpm test` を並列で回す → 各ファイル最初の beforeEach（PGlite の起動）が10秒で切れ、変更と無関係なテストまで落ちる → `pnpm --filter @proofmarket/web exec vitest run --no-file-parallelism` で直列に回す。CI では起きない
- 2026-10-03 [手元 / 空き容量] dev サーバーと pnpm install と next build を続けて回したら空きが 369MB まで減った → `npm cache clean --force` で `~/.npm/_cacache`（約4GB）を空ける。作り直せるキャッシュなので消してよい
- 2026-10-03 [Next.js 16 dev / トンネル] cloudflared のクイックトンネル越しに `next dev` の画面を開く → HMR の WebSocket が 403 で拒まれ、Turbopack の画面が「読み込み中…」のまま動かない → next.config の `allowedDevOrigins: ["*.trycloudflare.com"]` で許可する（開発サーバーにだけ効く）
- 2026-10-03 [e2e / トンネル] `NEXT_PUBLIC_BASE_URL` をトンネルの URL にして起動したサーバーに、localhost から worker.spec を流す → 開発用ストレージのアップロード先がトンネル側になり、別オリジン扱いで「通信に失敗しました」 → `E2E_BASE_URL` をサーバーの `NEXT_PUBLIC_BASE_URL` と同じにして流す
- 2026-10-04 [DB 移行 / Supabase] OAuth の表を手書きの移行（0003）で足したとき、0001 にある「全表で RLS を有効にする」を付け忘れ、PostgREST からトークンのハッシュが読める状態になっていた → 0004 で有効にし、public の全表で RLS が有効かを確かめるテストを migrations.test.ts に置いた。表を足すときはこのテストが落ちることで気づける
- 2026-10-04 [Next.js dev / PGlite] DEV_MODE で最初に DB を読むのがページ（RSC）だと、バンドルされた PGlite が wasm の場所を URL で受け取れず「The "path" argument must be of type string … Received an instance of URL」で落ち、以後そのプロセスでは RSC の全ページが DB を読めない（API ルートが先なら動く）→ next.config の `serverExternalPackages` に `@electric-sql/pglite` を入れてバンドルしない
- 2026-10-04 [CI / biome] 変更したディレクトリだけに `biome check --write` をかけて push → 触ったテストの整形と import の並び替えが漏れ、CI の `pnpm lint` が落ちた（積み上げた PR 5本にも波及）→ push の前にリポジトリ全体で `pnpm exec biome ci .` を流し、`×` が0件か確かめる（useTemplate・useOptionalChain の3件は main からある警告）
- 2026-10-04 [devnet-setup / genesis] Devnet の genesis hash を定数に 32 字で書いていたため、本物の Devnet（EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG）を「Devnet ではない」と判定して止まった → 44 字の全体で比べる。`solana genesis-hash -u devnet` で確かめられる
- 2026-10-04 [Supabase 接続] Connect 画面の Direct connection（db.<ref>.supabase.co:5432）に手元から繋ぐ → 無料プランの直通は IPv6 のみで ECONNREFUSED → 同じ pooler ホストのポート 5432（Session pooler）を使う。DDL もこれで通る。なお Connect 画面からコピーした接続文字列は折り返しの改行が混ざることがあるので、1行か確かめる
- 2026-10-04 [CI / OpenAPI] zod のスキーマ（packages/core/src/schemas/api.ts）を変えたまま push → CI の「OpenAPI is up to date with the zod schemas」が落ちた → スキーマを変えたら `pnpm openapi` で openapi.json を作り直してからコミットする
- 2026-10-04 [Vercel / プレビュー] 手元のコミットの作者メールが Mac のローカル名（user@host.local）のまま push → Vercel が「Git account for the commit author が見つからない」でプレビューを止めた → リポジトリの git config user.email を GitHub の noreply アドレス（131566598+shoripanda@users.noreply.github.com）にする
- 2026-10-08 [動画 / ffmpeg 9] 字幕 PNG を `-i sub.png` で読み `overlay=…:enable='between(t,a,b)'` で重ねる → 1 コマ目にしか効かず、音声入力と `-shortest` を併用すると字幕が消える（`-loop 1` でも同じ。`-shortest` と無限ループ画像の組では止まらない）→ 字幕は録画するページの中に固定の帯として描く（`docs/pitch/03-videos/render/demo/build.mjs`）
- 2026-10-08 [音声合成 / kokoro-onnx] pip の `espeakng-loader` 同梱 espeak が macOS でデータパスを読めず `Error processing file '/Users/runner/…/phontab'` で落ちる（`ESPEAK_DATA_PATH` や `set_data_path` でも直らない）→ `brew install espeak-ng` を入れ、`EspeakConfig(lib_path=/opt/homebrew/lib/libespeak-ng.dylib, data_path=/opt/homebrew/share/espeak-ng-data)` を渡す
- 2026-10-08 [YouTube 投稿 / yt-upload.mjs] 説明文ファイルを相対パスで渡す → `!` から実行すると cwd が違い ENOENT でファイル選択の直後に落ち、Studio に無題の下書きが残る → 引数はすべて絶対パスにする。zsh では `rm -f dir/Singleton*` のように一致しないグロブがあるとコマンド列全体が止まるので、ファイル名を列挙する
- 2026-10-08 [/try の見本写真 / SVG] 掲示の文に `&` を含めたまま SVG 文字列に埋め込む → data URL の XML が壊れて画像が出ず alt 文字だけ表示される → `signPhoto` で `& < >` をエスケープする
- 2026-10-08 [YouTube 投稿 / yt-upload.mjs] 「作成」メニューから開いた投稿ダイアログで、2 秒待っただけでファイルを選ぶ → 「ファイルを選択」がまだ無効（初期化中）でファイルが無視され、詳細画面を 60 秒待って失敗。Studio には何も残らない → ボタンの disabled / aria-disabled が外れるまで待ってから選び、詳細画面が出なければ選び直す（3 回まで）
- 2026-10-08 [動画 / 描画中の空き容量] 30fps の描画（silent.mp4 を書き出し中）と並行して 234MB の Chrome プロファイルを scratchpad へ複製 → データ領域が 0 になり、ffmpeg が EPIPE で止まり、Bash ツール自体も出力を書けず動かなくなった（Monitor ツール経由の rm で復旧）→ 描画の前に `df -h /System/Volumes/Data` で 5GB 以上あるか見る。Solana-idea 各 worktree の `.next`（計 3GB 超）と pip・Homebrew のキャッシュは消してよい。プロファイルは複製せず、元の場所をそのまま使う
- 2026-10-08 [Playwright / 容量不足のあと] データ領域が 0 になった直後、`~/Library/Caches/ms-playwright`（1.4GB）が丸ごと消えていて `browserType.launch: Executable doesn't exist` で描画が落ちた（macOS が Caches を空けたとみられる）。`pnpm exec playwright` は見つからない → `node node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/cli.js install chromium-headless-shell` で入れ直す
- 2026-10-08 [プログラム v1.1 / デプロイ用 .so] `anchor build`（既定 `--arch v3`）の .so は SBPF v3（ELF e_flags=3）だが、Devnet に載っている版は v0（e_flags=0、`solana program dump` で確認）→ デプロイ用は `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml --tools-version v1.57`（v0）で作り直し、その .so で `cargo test -p proofmarket` を通してから載せる。v0 は現行の領域より大きくなりうるが、CLI 4.x の `program deploy` は既定で自動拡張する
- 2026-10-08 [worktree / zsh のループ] `for p in "e feat/x" ...; do set -- $p; git worktree add ../proofmarket-$1 -b $2 origin/main` → zsh は `$p` を単語に分けないので、空白入りのパスの worktree と `origin/main` という名前のローカルブランチができ、以後 `origin/main` があいまいになった → 関数 `mk(){ git worktree add "../proofmarket-$1" -b "$2" refs/remotes/origin/main; }` に引数を分けて渡す。誤って作ったら `git worktree remove --force` と `git update-ref -d refs/heads/origin/main` で消す
- 2026-10-08 [本番 / tick 500] 生の `sql\`…\`` に JS の Date（`${now}`）を直接渡した（challenge-service の runOptimistic）→ postgres-js は Date を `toString()`（`Thu Oct 08 2026 …`）で送り Postgres が読めず、tick が毎分 500。PGlite のテストでは ISO になるので通ってしまい、tick の先頭で落ちたため決済ジョブまで止まった（VERIFIED が「確定待ち」のまま）→ 生 SQL の時刻は `now.toISOString()`（jobs.ts と同じ）を渡す。tick は段ごとに try/catch で分離し、戻り値 `failed` に段名を残す
- 2026-10-09 [/join の API キー] 申し込んだのにキーのメールが届かない、という報告を「送信の不具合」として調べた → /join は申し込みを DB に保存するだけで、メールを送る仕組みもキーを発行する処理も無かった（運営者が `list-participation.ts` で読んで手で出す作り）。届かないのは未実装のため → 01 §4.28 で、その場で発行して画面に出す形にした（メールは控え。Resend の登録や DNS を待たずに使える）。移行 0026 はコードより先に当てる（新しい列に書き込むので、逆だと /join が止まる）
