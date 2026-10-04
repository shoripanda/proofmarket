# 担当 E: ほかの AI から本番につなぐ確認と、接続手順のページ

ブランチ: `docs/agent-clients` ／ worktree: `../Solana-idea-e` ／ DB の移行: 作らない
**この担当はオーナーの画面操作が要る。** 操作をお願いするときは、開く URL と押す場所を具体的に示す。

## なぜやるか
「ほかの AI エージェントにも搭載できるか」を、審査の前に実際の製品で確かめて見せる。本番の MCP（`https://proofmarket-rosy.vercel.app/mcp`、OAuth の自動登録に対応）は手元のテストしか通していない。

## やること
1. **Claude Code から本番の MCP につなぐ**
   - API キーで: `claude mcp add --transport http proofmarket https://proofmarket-rosy.vercel.app/mcp --header "Authorization: Bearer <キー>"`。キーは `~/.config/proofmarket/env.requester` の `API_KEY`。**キーをチャットや PR に書かない。** スコープは local にし、終わったら `claude mcp remove` で外すかオーナーに確かめる。
   - 道具の一覧が出ること、場所を問わない依頼（例: `DOCUMENT_TRANSCRIPTION`）を1件出し、`get_reality_verification` で状態が読めることを確かめる。依頼は試験用 USDC 0.5 以下、締め切り3時間以内。worker への作業依頼はオーナーに一言伝える。
2. **claude.ai のコネクタからつなぐ**（オーナーの操作）: 設定 → コネクタ → カスタムコネクタを追加 → URL に `https://proofmarket-rosy.vercel.app/mcp`。OAuth の画面で API キーを貼る流れになるはず。つながったら、会話の中で依頼を出して結果を読めるか試してもらう。うまくいかなければ、画面の文言を聞いて原因を調べる（`apps/web/app/oauth/`、`.well-known/`）。
3. **ChatGPT からつなぐ**（オーナーの操作）: ChatGPT のコネクタ（MCP）か、GPT の Actions（`packages/core/openapi.json` を読み込む）のどちらか、いま使えるほうで試す。手順は公式の最新の案内を WebSearch で確かめてから示す。
4. **うまくいかなかった所は直す**。直すのがコードなら、このブランチで直して PR に含める。
5. **接続手順のページ**: 開発者向けページ（`apps/web/app/(site)/developers/page.tsx`）に「各 AI からつなぐ」の節を足す。Claude Code、claude.ai、ChatGPT、Cursor などの MCP クライアント、REST（curl）。実際に確かめたものと、確かめていないものを分けて書く。x402 の節は担当 A が書くので触らない。
6. 確かめた結果を `docs/agent-clients-check-2026-10-04.md` に残す（どのクライアントで、何ができて、何がだめだったか。画面の写真があれば場所だけ書く）。

## 触らないもの
- 依頼・提出・判定の仕組み（不具合を見つけたら直してよいが、範囲を広げない）。
- 本番の DB・Vercel の設定。

## 完了の条件
- Claude Code・claude.ai・ChatGPT のそれぞれで、つながったか、どこで止まったかが記録されている。
- 接続手順のページが本番に出ている（PR の取り込みで自動公開）。
- README の「仕上げ」を満たす。
