# ほかの AI から本番の MCP につなぐ確認（担当 E）

作成: 2026-10-05 ／ 対象: https://proofmarket.fun/mcp ／ 指示書: `docs/agents/E-agent-clients.md`

## 結果の一覧

| クライアント | 結果 | 確かめた日 | 備考 |
|---|---|---|---|
| Claude Code（API キーをヘッダーで） | **つながった** | 2026-10-05 | `claude -p --mcp-config` で道具 4 つが見え、`get_reality_verification` の呼び出しがサーバーまで届いた（ID の形式違いを正しく 32602 で返した） |
| REST（curl） | **つながった** | 2026-10-05 | `tools/list` を直接呼んで 4 つの道具。キー無しは 401 と `WWW-Authenticate: Bearer resource_metadata=...` |
| OAuth の公開設定 | **そろっている** | 2026-10-05 | `/.well-known/oauth-protected-resource`・`/.well-known/oauth-authorization-server`。登録・認可・トークンの窓口、PKCE S256、公開クライアントのみ |
| claude.ai のコネクタ | **つながった** | 2026-10-06 | `https://proofmarket.fun/mcp` をカスタムコネクタに登録。OAuth（動的クライアント登録 → ProofMarket の許可画面で API キー）を経て、会話から 7 つの道具が見えた |
| ChatGPT（開発者モードのコネクタ） | 未確認 | — | 同上。公式の案内では DCR に対応（developers.openai.com の Authentication） |
| Cursor など | 未確認 | — | 手順のみ |

## 試験で出した依頼

- MCP 経由の依頼の作成は、Claude Code の自動判定（実際の取引）で止められたため、この画面からは出していない。代わりに x402 の見本のエージェントで本番に 1 件出し（`ver_01M43J9C0R5H04CE9XCW83D7HA`、DOCUMENT_TRANSCRIPTION、0.1 USDC）、402 → 支払い → 201 → OPEN まで通った（担当 A の本番手順）。

## 直したこと

- 見本のエージェントが、場所の要る依頼を場所なしで出して必ず 400 になっていた（PR #43 で 17 種類に対応）。
- 公開の結果が文章の答えと AI の確認メモを返していた（PR #45 で修正）。

## 残り

- claude.ai と ChatGPT で実際につなぎ、依頼を 1 件出して結果を読む。うまくいかなければ、画面の文言から `apps/web/app/oauth/`・`.well-known/` を調べる。
- 確かめたら `/developers` の「確認済み」の印（`CLIENTS[].checked`）を更新する。
