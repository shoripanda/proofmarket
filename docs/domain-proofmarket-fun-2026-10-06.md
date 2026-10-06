# proofmarket.fun への移行手順（2026-10-06）

ドメイン `proofmarket.fun` は 2026-10-06 13:50 UTC に Cloudflare Registrar で登録済み。旧 URL `https://proofmarket-rosy.vercel.app` は転送用に残す。

## 順番（オーナーの作業。1〜5 の順に、合計 30 分ほど）

1. **Cloudflare の DNS**（dash.cloudflare.com → proofmarket.fun → DNS）
   - `A` レコード: 名前 `@`、値 `76.76.21.21`、プロキシは **オフ**（DNS only）
   - `CNAME` レコード: 名前 `www`、値 `cname.vercel-dns.com`、プロキシは **オフ**
   - プロキシをオンにすると Vercel の証明書発行と WebSocket が乱れるので、必ずオフにする
2. **Vercel にドメインを足す**（vercel.com → proofmarket → Settings → Domains）
   - `proofmarket.fun` を追加し、Production に割り当てる
   - `www.proofmarket.fun` も追加し、「Redirect to proofmarket.fun」を選ぶ
   - `proofmarket-rosy.vercel.app` はそのまま残す。Vercel は自動で新しい主ドメインへ 308 で転送する
   - 証明書が「Valid」になるまで数分待つ
3. **Vercel の環境変数**（Settings → Environment Variables、Production）
   - `NEXT_PUBLIC_BASE_URL` = `https://proofmarket.fun`（無ければ新規、あれば書き換え）
   - 保存したら Deployments → 最新 → Redeploy。OAuth の発行者（issuer）、証明のリンク、x402 の resource URL がこの値で作られる
4. **Privy**（dashboard.privy.io → アプリ → Settings → Domains / Allowed origins）
   - `https://proofmarket.fun` を許可ドメインに追加。旧ドメインも当面残す
   - Google ログインの戻り先は Privy 側のドメインなので、Google Cloud 側の設定変更は不要
5. **claude.ai のコネクタ**（claude.ai/settings/connectors）
   - ProofMarket の URL を `https://proofmarket.fun/mcp` に変える（いま 502 になっているもの）
   - つなぎ直すと ProofMarket の許可画面が開くので、API キーを貼る

## 動作の確認（移行後に 1 回）

```
curl -s https://proofmarket.fun/.well-known/oauth-authorization-server | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://proofmarket.fun/mcp      # 401 が正しい
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://proofmarket-rosy.vercel.app/en   # 308 → proofmarket.fun
```

## この Mac の確認係（launchd）

`scripts/review-runner.ts` の既定の宛先はこの PR で `https://proofmarket.fun` に変えた。main を pull すれば次の実行から新しい宛先を使う。旧 URL への POST は転送されない可能性があるため、移行の当日中に `git -C ~/Solana-idea pull` を忘れない。

## 影響しないもの

API キー、データベース、Solana のプログラムと記録、worker のウォレット。ホスト名だけの変更。

## 残る作業

- サイトの文言と資料に残る旧 URL（`docs/pitch/`、`docs/agents/`、予定表、報告書）を新 URL に置き換える
- Colosseum の提出フォームの URL を `https://proofmarket.fun/en` にする
- `proofmarket.sns`（Solana Name Service）は運営ウォレットの表示名として使う。ブラウザからは開けないので、サイトの住所にはしない
