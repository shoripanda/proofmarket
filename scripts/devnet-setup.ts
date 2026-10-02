// pnpm tsx scripts/devnet-setup.ts [--own-mint]   (06 §7 steps 5-6, §6)
// - Refuses unless the RPC genesis hash is Devnet's.
// - initialize_config(admin = ~/.config/proofmarket/admin.json, operator, verifier, max_witnesses = 5)
// - creates the operator's ATA for BOUNTY_MINT (treasury)
// - --own-mint: creates a 6-decimal test mint and calls update_config(bounty_mint, treasury); results then carry test_asset: true
// Implementation: PR-10.
throw new Error("NOT_IMPLEMENTED: devnet-setup (PR-10)");
