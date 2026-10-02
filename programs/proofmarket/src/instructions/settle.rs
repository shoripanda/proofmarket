use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::*,
    error::ProofMarketError,
    state::{Config, Task},
};

#[derive(Accounts)]
pub struct Settle<'info> {
    /// Also receives the vault's rent when it is closed.
    #[account(mut, address = config.operator @ ProofMarketError::Unauthorized)]
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TASK_SEED, task.task_id_hash.as_ref()], bump = task.bump)]
    pub task: Account<'info, Task>,
    #[account(address = task.mint @ ProofMarketError::InvalidMint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [VAULT_SEED, task.key().as_ref()], bump = task.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, address = config.treasury @ ProofMarketError::InvalidTreasury)]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    // remaining_accounts: recipients' ATAs (writable), same order as task.recipients[..recipient_count]
}

/// PR-09 (06 §3.4):
/// - status == Finalized (else InvalidStatus) — Settled/Refunded can never be settled again (D8, D10)
/// - remaining_accounts.len() == recipient_count; each == get_associated_token_address(recipients[i], mint),
///   mint and owner match (RecipientAccountMismatch)
/// - amount_per_witness * recipient_count <= vault.amount; pay each, remainder -> treasury, close vault -> operator
/// - status = Settled, paid_total, closed_at; emit TaskSettled
pub fn handle_settle<'info>(_ctx: Context<'info, Settle<'info>>) -> Result<()> {
    todo!("PR-09: settle")
}
