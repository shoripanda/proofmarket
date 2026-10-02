use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::{
    constants::*,
    error::ProofMarketError,
    state::{Config, RefundReason, Task},
};

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut, address = config.operator @ ProofMarketError::Unauthorized)]
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TASK_SEED, task.task_id_hash.as_ref()], bump = task.bump)]
    pub task: Account<'info, Task>,
    #[account(mut, seeds = [VAULT_SEED, task.key().as_ref()], bump = task.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, address = config.treasury @ ProofMarketError::InvalidTreasury)]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// PR-09 (06 §3.5):
/// - status == Funded (else InvalidStatus) — a Finalized/Settled task can never be refunded (D9)
/// - reason == Expired requires Clock::unix_timestamp > deadline (NotExpired); reason None is rejected
/// - transfer all vault -> treasury, close vault -> operator, status = Refunded; emit TaskRefunded
/// Trust note: the operator may refund a Funded task at any time as Cancelled; off-chain T15 guards this (disclosed).
pub fn handle_refund(_ctx: Context<Refund>, _reason: RefundReason) -> Result<()> {
    todo!("PR-09: refund")
}
