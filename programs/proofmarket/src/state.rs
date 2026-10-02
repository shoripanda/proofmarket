use anchor_lang::prelude::*;

use crate::constants::MAX_RECIPIENTS;

/// seeds = [CONFIG_SEED]
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub verifier: Pubkey,
    /// Circle Devnet USDC or an own test mint (06 §6).
    pub bounty_mint: Pubkey,
    /// operator-owned ATA of bounty_mint.
    pub treasury: Pubkey,
    /// <= MAX_RECIPIENTS.
    pub max_witnesses: u8,
    /// true: initialize_task is rejected. finalize/settle/refund keep working so workers still get paid.
    pub paused: bool,
    pub bump: u8,
}

/// seeds = [TASK_SEED, task_id_hash]. Kept forever as the public receipt; only the vault is closed.
#[account]
#[derive(InitSpace)]
pub struct Task {
    pub version: u8,
    pub bump: u8,
    pub vault_bump: u8,
    /// SHA-256("proofmarket:task:v1:" + verification_id)
    pub task_id_hash: [u8; 32],
    /// Funding source. MVP: treasury owner (operator) as custodian of the requester's prepaid balance (D-05).
    pub requester: Pubkey,
    /// SHA-256(credential_id), for per-requester aggregation without identity.
    pub requester_ref_hash: [u8; 32],
    pub mint: Pubkey,
    /// Base units (USDC: 10^-6).
    pub amount_per_witness: u64,
    pub required_witnesses: u8,
    pub quorum: u8,
    /// Unix seconds. Used only for refund(Expired); finalize has no time limit (D-11).
    pub deadline: i64,
    pub status: TaskStatus,
    pub outcome: Outcome,
    pub refund_reason: RefundReason,
    pub evidence_root: [u8; 32],
    pub result_hash: [u8; 32],
    pub recipient_count: u8,
    pub recipients: [Pubkey; MAX_RECIPIENTS],
    pub paid_total: u64,
    pub created_at: i64,
    pub finalized_at: i64,
    pub closed_at: i64,
}

/// Off-chain mapping: 03-state-machine.md §4.3.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum TaskStatus {
    Funded,
    Finalized,
    Settled,
    Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Outcome {
    None,
    Verified,
    NoConsensus,
    InsufficientWitnesses,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum RefundReason {
    None,
    Cancelled,
    Expired,
}
