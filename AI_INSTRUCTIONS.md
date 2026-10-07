# AI_INSTRUCTIONS.md

このリポジトリで作業する AI エージェント向けの共通入口です。

**正本の作業ルールは [`AGENTS.md`](AGENTS.md) です。作業開始前に必ず全文を読んでください。**

その後、次を順に読んでください。

1. `README.md`
2. `docs/proofmarket-concept-2026-10-02.md`（製品の構想）
3. `specs/proofmarket/README.md` と、そこに書かれた read order の仕様一式
4. `specs/proofmarket/implementation/ja/`（実装設計書。ja が正本、en は訳）
5. `docs/solana-research-2026-09-11.md`（Solana の技術メモ。必要なときだけ）

重要原則:

- Solana の利用そのものを目的にしない。既存サービスや通常の DB で足りるかを先に反証する。
- 事実と仮説を分ける。統計・制度・競合の情報には基準日と一次資料の URL を残す。
- 個人情報・写真・GPS をそのまま public chain に置かない。チェーンにはハッシュ・状態・決済だけ。
- 仕様（要件・API 契約・受け入れ基準・セキュリティ）を変えるときは、コードより先に仕様文書を直す。
- `.env`・秘密鍵・API キーをコミットしない。手元の秘密は `~/.config/proofmarket/` に置く。
