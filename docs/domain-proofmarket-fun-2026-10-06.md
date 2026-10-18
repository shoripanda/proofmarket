# Moving to proofmarket.fun (2026-10-06)

The domain `proofmarket.fun` was registered with Cloudflare Registrar at 13:50 UTC on 2026-10-06. The old URL `https://proofmarket-rosy.vercel.app` stays for redirects.

## Order (the owner's work: steps 1–5 in order, about 30 minutes in total)

1. **Cloudflare DNS** (dash.cloudflare.com → proofmarket.fun → DNS)
   - `A` record: name `@`, value `76.76.21.21`, proxy **off** (DNS only)
   - `CNAME` record: name `www`, value `cname.vercel-dns.com`, proxy **off**
   - Turning the proxy on disturbs Vercel's certificate issuance and WebSockets, so it must be off
2. **Add the domain in Vercel** (vercel.com → proofmarket → Settings → Domains)
   - Add `proofmarket.fun` and assign it to Production
   - Add `www.proofmarket.fun` too and choose "Redirect to proofmarket.fun"
   - Leave `proofmarket-rosy.vercel.app` as is; Vercel redirects it to the new primary domain with 308 automatically
   - Wait a few minutes until the certificate shows "Valid"
3. **Vercel env vars** (Settings → Environment Variables, Production)
   - `NEXT_PUBLIC_BASE_URL` = `https://proofmarket.fun` (create or overwrite)
   - After saving, Deployments → latest → Redeploy. The OAuth issuer, proof links and the x402 resource URL are built from this value
4. **Privy** (dashboard.privy.io → app → Settings → Domains / Allowed origins)
   - Add `https://proofmarket.fun` to the allowed domains. Keep the old domain for now
   - Google sign-in returns to Privy's domain, so nothing changes on the Google Cloud side
5. **claude.ai connector** (claude.ai/settings/connectors)
   - Change ProofMarket's URL to `https://proofmarket.fun/mcp` (the one returning 502 now)
   - Reconnecting opens ProofMarket's consent screen; paste the API key

## Checking (once after the move)

```
curl -s https://proofmarket.fun/.well-known/oauth-authorization-server | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://proofmarket.fun/mcp      # 401 is correct
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://proofmarket-rosy.vercel.app/en   # 308 → proofmarket.fun
```

## The checker on this Mac (launchd)

This PR changed the default target of `scripts/review-runner.ts` to `https://proofmarket.fun`. Pulling main makes the next run use the new target. POSTs to the old URL may not be redirected, so do not forget `git -C ~/Solana-idea pull` on the day of the move.

## Not affected

API keys, the database, the Solana program and its records, worker wallets. Only the host name changes.

## Remaining work

- Replace the old URL left in site copy and materials (`docs/pitch/`, `docs/agents/`, the schedule, the report) with the new one
- Set the URL in the Colosseum submission form to `https://proofmarket.fun/en`
- `proofmarket.sns` (Solana Name Service) is used as the display name of the operator wallet. Browsers cannot open it, so it is not the site's address
