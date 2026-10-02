use anchor_lang::prelude::*;

use crate::state::{Outcome, RefundReason};

#[event]
pub struct TaskInitialized {
    pub task: Pubkey,
    pub task_id_hash: [u8; 32],
    pub amount_total: u64,
    pub deadline: i64,
}

#[event]
pub struct VerificationFinalized {
    pub task: Pubkey,
    pub outcome: Outcome,
    pub evidence_root: [u8; 32],
    pub result_hash: [u8; 32],
    pub recipient_count: u8,
}

#[event]
pub struct TaskSettled {
    pub task: Pubkey,
    pub paid_total: u64,
    pub remainder: u64,
}

#[event]
pub struct TaskRefunded {
    pub task: Pubkey,
    pub amount: u64,
    pub reason: RefundReason,
}
