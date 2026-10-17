# Which mainnet RPC provider to contract (2026-10-13)

An item left "undecided" in spec 15 §6, compared at the owner's request. Prices were read from each provider's pricing page on 2026-10-13; check again before signing up.

## Estimated volume

The server calls RPC for four things. The per-minute tick accounts for most of it.

| Who | What | Rough count |
|---|---|---|
| tick (every minute) | Deposit detection: `getSignaturesForAddress` (up to 25 requesters with a reference) + `getTransaction` | 25–50 per minute |
| tick (every minute) | Sending and confirming settlement jobs (`sendTransaction`, `getSignatureStatuses`) | 3–6 per request |
| Creating a request | Funding escrow (`initialize_task`) | About 3 per request |
| Public pages | Browser-side checks use **public RPC**, so they are not counted here | 0 |

At 100 requests a day, about 2–3 million calls a month. Even at 1,000 a day it stays under 10 million. Per second, 10–20 calls bunch up at the moment of a tick.

## Candidates

| Provider | Entry plan | Monthly | Included | Per-second limit | Overage | Notes |
|---|---|---|---|---|---|---|
| **Helius** | Developer | $49 | 10 million credits (a standard call = 1 credit; `getProgramAccounts` and historical data = 10) | 50 | $5 / million | The free tier is 1 million at 10 rps, with `sendTransaction` limited to 1 per second. Solana-only; Staked Connections (better landing) available for a fee |
| **QuickNode** | Build | $49 ($42 annual) | 80 million credits | 50 | $0.62 / million | Solana calls are heavy at around 30 credits each, so about 2.7 million calls in practice. Multi-chain |
| **Triton One** | Starter | $500 | Shared RPC | — | Custom quote | Their own page calls it "for frontends". Production backends are custom contracts, expensive at small scale |

Sources: [Helius pricing](https://www.helius.dev/pricing), [QuickNode pricing](https://www.quicknode.com/pricing), [Triton One](https://www.triton.one/solana).

## Recommendation

Start with **Helius Developer ($49/month)**, for three reasons.

1. The estimated volume (3 million calls a month or less) fits comfortably in 10 million credits, and overage is only $5 per million
2. 50 per second covers the tick's peak (10–20). The free tier's 10 could return 429 when settlements overlap
3. Solana-only, with relaxed `sendTransaction` limits (the free tier's "1 per second" is tight for settlement jobs)

QuickNode Build costs the same, but Solana calls cost 30 credits, so it falls behind Helius in real calls. Triton is expensive for the volume.

## To decide after signing up

- Put the Helius URL (with API key) in `SOLANA_RPC_URL`. The URL itself is a secret; do not write it in the repository or runbooks
- Set a usage alert at 80% in the Helius dashboard
- If monthly usage exceeds 5 million credits, consider moving to Business ($499, 100 million). Before that, it is cheaper to narrow the tick's `getSignaturesForAddress` to "requesters whose balance moved recently"
