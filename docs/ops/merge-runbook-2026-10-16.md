# ProofMarket：朝に打つ手順（PR #39〜#47 と移行 0029〜0031）

夜のうちに確かめたこと（2026-10-16 00:15）
- PR 9 本はどれも MERGEABLE・CLEAN、CI 通過
- 本番の review-runner（launchd）は動いている
- v1.3 は v1.2 の呼び出しも受け付けるので、サーバーを先に上げても USDC と SOL の依頼は止まらない（12 §9a）
- 旧コードはフラグをキー単位で読むので、0030 を先に当てても困らない

**注意：移行 0029 は deposits の主キーを (signature) から (signature, asset) に変える。**
今の本番コードは `onConflictDoNothing({ target: signature })` なので、0029 を当ててから #41 が本番に届くまでの間は入金の記帳が失敗する。0029 を当てたら、すぐ #41 までマージすること。

**`--delete-branch` は使わない。** 2026-10-16 に #39 を `-R … --delete-branch` でマージしたら、次の #40 は main に付け替えられず CLOSED になった。各 PR はマージの直前に `gh pr edit <番号> -R $R --base main` で土台を付け替え、ブランチは全部入ってからまとめて消す。下のコマンドの `--delete-branch` は読み替えること。

```bash
# 0. 準備
R=shoripanda/proofmarket
cd ~/proofmarket-tokens && git fetch origin
set -a; . ~/.config/proofmarket/env.accounts; set +a

# 1. 移行の要らない 2 本
gh pr merge 39 -R $R --merge --delete-branch
gh pr merge 40 -R $R --merge --delete-branch

# 2. 0029 を当ててから #41（ここは続けて打つ）
git checkout --detach origin/feat/multi-token-offchain
DATABASE_URL=$DATABASE_URL_DIRECT pnpm db:migrate
gh pr merge 41 -R $R --merge --delete-branch
gh pr merge 42 -R $R --merge --delete-branch

# 3. 0030 を当ててから #44
git checkout --detach origin/feat/arch-phase3
DATABASE_URL=$DATABASE_URL_DIRECT pnpm db:migrate
gh pr merge 44 -R $R --merge --delete-branch

# 4. 0031 を当ててから #45
git checkout --detach origin/feat/arch-phase2
DATABASE_URL=$DATABASE_URL_DIRECT pnpm db:migrate
gh pr merge 45 -R $R --merge --delete-branch

# 5. 残り
gh pr merge 46 -R $R --merge --delete-branch
gh pr merge 47 -R $R --merge --delete-branch
gh pr merge 43 -R $R --merge --delete-branch

# 6. 本番の確認（Vercel のデプロイが終わってから）
curl -s https://proofmarket-rosy.vercel.app/v1/health/ready
curl -s https://proofmarket-rosy.vercel.app/v1/public/assets
git checkout feat/arch-widget
```

各 `gh pr merge` の前に、`gh pr view <番号> -R $R --json baseRefName -q .baseRefName` が `main` になっているかを見る。前の PR を消した直後は、付け替えに数秒かかることがある。

## そのあと（急がない）

| 作業 | 手順 |
|---|---|
| Vercel に `TREASURY_MAX_USDC` / `TREASURY_MAX_SOL` | 無くても動く。入れると財布の残高が上限を超えたときに警告が出る |
| Devnet にプログラム v1.3 | 12 §9a の 1〜2（`cargo build-sbf --tools-version v1.57 …` → `cargo test -p proofmarket` 29 本 → `solana program deploy …`） |
| 試験用の USDT・PYUSD の mint | 12 §9a の 3。走らせるたびに新しい mint ができるので 1 回だけ |
| ChatGPT のウィジェット | #47 が入ったあと、ChatGPT から呼んで結果のカードが出るかを見る |
| 5 USDC 以上の依頼 | #46 が入ると運営者の審査待ちになる。Mac の review-runner が止まると払い出されない。止めるなら `HUMAN_REVIEW_MIN_TOTAL=0` |
