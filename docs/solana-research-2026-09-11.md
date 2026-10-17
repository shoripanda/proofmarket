# Solana technical research notes

Research date: **2026-09-11**

## Approach

Organizes Solana's specification, performance and risks, preferring primary sources: official Solana docs, the Solana Foundation, the original whitepaper, and the official changelog / upgrade tracker.

## 1. Basic structure

Solana is a permissionless Layer 1 blockchain designed as a high-throughput, low-fee, low-latency execution environment.

### Proof of History (PoH)

PoH is not a consensus mechanism in itself. It makes the order of events and the passage of time verifiable through continuous cryptographic computation, aiming to reduce coordination between validators about time and ordering.

Today Solana reaches consensus with Proof of Stake and Tower BFT.

### Accounts

Solana stores state in accounts. The official Core Concepts describe accounts as a key-value store keyed by a 32-byte address.

### Programs

Solana smart contracts are called programs and compile to sBPF. Programs are in principle stateless; mutable state lives in data accounts passed in instructions.

### Transactions / instructions

An instruction is a unit of program invocation, and several instructions can be grouped into one transaction. Transactions are processed atomically.

## 2. Parallel execution

On Solana, a transaction declares in advance which accounts it accesses. Transactions that do not contend for the same writable account can therefore run in parallel.

For services aimed at social problems, this may suit systems handling many independent events, such as:

- proof of ride for mobility services
- small voucher redemptions
- recycling collection events
- proof of food donation / handover
- custody transfer in logistics
- incentive distribution

## 3. Fees

As of 2026-09-11, the official Solana fees documentation puts the base fee at **5,000 lamports per signature**.

An optional priority fee can be added.

The fee payer can be a different party, so municipalities or service operators can sponsor users' transaction fees. This allows designs where ordinary users can use a service without holding SOL.

## 4. Main network changes in 2026

### 100M CU blocks

In July 2026, SIMD-0286 activated on mainnet, raising the block limit from **60M to 100M compute units**.

### 300 ms target slot time

On 2026-08-28, a feature gate shortening the target slot time to **300 ms** activated on mainnet.

### V1 transactions

V1 transactions are planned to raise the maximum transaction size from **1,232 bytes to 4,096 bytes**.

As of 2026-09-11 this has not yet activated on mainnet; the official upgrade tracker schedules activation for **2026-09-15 01:20 UTC**.

### Alpenglow

Solana is working to replace Tower BFT with the next-generation consensus protocol **Alpenglow**.

Alpenglow Phase 1 introduces the Votor voting algorithm, targeting about **150 ms finality**.

As of 2026-09-11, Alpenglow consensus is not live on mainnet. The official upgrade tracker plans it for Agave 4.3, around October 2026.

Phase 2 is expected to move block propagation from Turbine to Rotor.

## 5. Network health and decentralization

The Solana Foundation's June 2025 Network Health Report gave, as of 2025-04-16:

- Consensus validators: 1,295
- Nakamoto coefficient: 20
- Validator clients: 3

This is the Foundation's own report from 2025 and is not treated as a real-time value for 2026.

Validator client diversity matters for reducing the risk of a network-wide failure from a single software bug. Besides Agave, Firedancer / Frankendancer implementations are progressing.

## 6. Past outages

On 2024-02-06, Solana Mainnet Beta stopped finalizing blocks for about 5 hours.

According to the official outage report, legacy loader behaviour related to LoadedPrograms caused an infinite recompile loop. Over 95% of cluster stake ran that version at the time, so many validators stopped simultaneously and consensus halted.

For social-infrastructure uses, it matters not to make Solana a single point of failure.

Examples:

- a temporary off-chain queue
- resend handling
- offline voucher / QR fallback
- reconciliation after the chain recovers
- read model / local cache

## 7. Solana properties useful for social-problem services

### A. Recording many events at low cost

May suit uses with small value per event and high volume, such as logistics, transport, food and recycling.

### B. Several parties can verify the same history

When municipalities, companies, citizens and NPOs join the same service, it offers an audit layer different from a database run by a single operator.

### C. Automating rules with programs

Purpose-limited vouchers, expiry, rewards, escrow, settlement and so on can be implemented as programs.

### D. Fee sponsorship

A UX can be built that requires no crypto knowledge or SOL from users.

## 8. Cautions for social-problem uses

### Do not put personal data directly on chain

A public blockchain's history is widely verifiable. Names, addresses, medical information, evacuation information, identity documents and trade secrets belong off chain in principle.

Recommended pattern:

- on chain: hash / status / timestamp / pseudonymous identifier / settlement
- off chain: actual records / PII / sensitive business data

### The oracle problem

A blockchain can provide "the recorded input is hard to tamper with", but does not automatically guarantee "the recorded fact is true in the real world".

So it must be combined with QR, NFC, IoT sensors, government authentication, operator signatures, attestations by several parties and the like.

### Law

Issuing a token may, depending on its design, require review under Japan's Payment Services Act, the Financial Instruments and Exchange Act and other regulations. In the public sector, also check personal data protection, government information systems, procurement and industry-specific rules.

## 9. Main primary sources

- Solana Whitepaper: https://solana.com/solana-whitepaper.pdf
- Solana Core Concepts: https://solana.com/docs/core
- Solana Programs: https://solana.com/docs/core/programs
- Solana Fees: https://solana.com/docs/core/fees
- Solana Fee Abstraction: https://solana.com/docs/payments/send-payments/payment-processing/fee-abstraction
- Solana Upgrades: https://solana.com/upgrades
- Solana Changelog: https://solana.com/changelog
- 100M CU Blocks changelog: https://solana.com/news/solana-changelog-july-30-2026
- 300ms Mainnet changelog: https://solana.com/de/news/solana-changelog-august-27-2026
- Alpenglow: https://solana.com/id/upgrades/alpenglow
- Agave 4.2 overview: https://solana.com/uk/upgrades/agave-4-2-release-overview
- 2024-02-06 outage report: https://solana.com/news/02-06-24-solana-mainnet-beta-outage-report
- Network Health Report June 2025: https://solana.com/id/news/network-health-report-june-2025

## 10. Further research

- The Alpenglow / Votor paper and formal specification
- Firedancer architecture
- Features and limits of Token-2022 for social-infrastructure uses
- Practicality of ZK / confidential transfers
- Long-term operating cost of Solana
- RPC / indexer architecture
- Conditions under Japanese law for using tokens, vouchers and stablecoins
