# Being found by x402 agents

Agents that pay with x402 find services through catalogs. As of 2026-11-08 ProofMarket was in none of them.

## Two catalogs, two ways in

| Catalog | How a service gets in | ProofMarket |
|---|---|---|
| Coinbase CDP **Bazaar** | Only after a payment is verified and settled **through the CDP facilitator**. No form, no API ([get-discovered](https://docs.cdp.coinbase.com/x402/seller/get-discovered.md)). Curation needs live mainnet payments. | Not possible while we are our own facilitator (`packages/solana/src/x402.ts`). Revisit with the mainnet move (v1.3); of 34,126 Bazaar entries on 2026-11-08, 2 were on Solana Devnet. |
| **x402scan** (Merit Systems) | Submit the origin or URL; it reads `/openapi.json` (`x-payment-info`) and probes the endpoint for a 402 ([DISCOVERY.md](https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md)). **Mainnet only**: base and solana. | Ready (PR #77), but refused on 2026-11-08 because production is on Devnet: `No supported networks. Got: [solana_devnet]. Supported: [base, solana]`. Nothing else failed validation. Register again after the mainnet move. |

## What the server does for discovery

- `/openapi.json`: `POST /v1/x402/verifications` carries `x-payment-info` (`protocols: [{x402: {}}]`, price `dynamic` in
  USD with no bounds, because the price is bounty × witnesses + fee) and a `402` response. `security: []` plus
  `x-payment-info` reads as "paid".
- `POST /v1/x402/verifications` with no body, or `{}`, and no `PAYMENT-SIGNATURE`: 402 with the terms for an example body
  (a `CUSTOM_TASK`, one witness, 0.10 USDC). Probes no longer get a 400. Any other body is validated as before.
- Every 402 carries `extensions.bazaar` (coinbase/x402 `specs/extensions/bazaar.md`): the example body, an output
  example, and a shallow JSON Schema of the body and the 201 response (top-level fields and types; the full schema
  is in `/openapi.json`). The full schema made the `PAYMENT-REQUIRED` header about 14 KB, which some proxies drop;
  the shallow one keeps it near 5 KB, and `apps/web/test/x402.test.ts` fails above 8 KB.
- `/.well-known/x402`: the legacy discovery document listing the one resource.

## Registering on x402scan (owner)

After deploy:

1. Check the probe: `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://proofmarket.fun/v1/x402/verifications`
   should print `402`.
2. Optional audit with their tool (it runs third-party code, so the owner runs it):
   `npx -y @agentcash/discovery proofmarket.fun -v`
3. Register with `npx agentcash register https://proofmarket.fun` (the web form at /resources/register needs a wallet
   sign-in and failed). It also probes every other path; the public and API-key ones are listed only next to a paid
   one, so those "skipped" lines are expected. Only after production moves to mainnet.
