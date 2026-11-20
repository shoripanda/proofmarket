-- Mainnet cutover blockers (15 §4.5, 2026-11-20).
-- 1. verification_requests still only accepted 'solana-devnet' (0000_init), so the first mainnet request would
--    fail on insert. Allow both networks; the API already refuses a body for the other cluster (wrong_network).
-- 2. requester_ledger had no chain: Devnet trial and test balances would have been spendable on mainnet, paid
--    from the operator's real treasury. Every row is tagged with its network and balances are summed per network.
--    Every existing row is Devnet money. The default stays so the old code keeps working between this migration
--    and the deploy (apply this first); the Drizzle schema has no default, so the new code must name the network.
ALTER TABLE verification_requests DROP CONSTRAINT vr_network_chk;
ALTER TABLE verification_requests ADD CONSTRAINT vr_network_chk CHECK (bounty_network in ('solana-devnet','solana'));
ALTER TABLE requester_ledger ADD COLUMN network text NOT NULL DEFAULT 'solana-devnet';
ALTER TABLE requester_ledger ADD CONSTRAINT requester_ledger_network_chk CHECK (network in ('solana-devnet','solana'));
