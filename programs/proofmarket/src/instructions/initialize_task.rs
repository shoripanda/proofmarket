use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::*,
    error::ProofMarketError,
    state::{Config, Task},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeTaskArgs {
    pub task_id_hash: [u8; 32],
    pub requester_ref_hash: [u8; 32],
    pub amount_per_witness: u64,
    pub required_witnesses: u8,
    pub quorum: u8,
    pub deadline: i64,
}

#[derive(Accounts)]
#[instruction(args: InitializeTaskArgs)]
pub struct InitializeTask<'info> {
    #[account(mut, address = config.operator @ ProofMarketError::Unauthorized)]
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// `init` fails if the PDA exists: the same task can never be funded twice (P-INIT-02, I-IDEM-03).
    #[account(
        init,
        payer = operator,
        space = 8 + Task::INIT_SPACE,
        seeds = [TASK_SEED, args.task_id_hash.as_ref()],
        bump
    )]
    pub task: Account<'info, Task>,
    #[account(address = config.bounty_mint @ ProofMarketError::InvalidMint)]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = operator,
        seeds = [VAULT_SEED, task.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = task,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, address = config.treasury @ ProofMarketError::InvalidTreasury)]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// PR-09 (06 §3.2):
/// - !config.paused; amount_per_witness > 0; 1 <= quorum <= required_witnesses <= config.max_witnesses
/// - deadline > Clock::unix_timestamp; total = amount_per_witness.checked_mul(required_witnesses)
/// - transfer total treasury -> vault (operator signs as treasury owner)
/// - write Task (status = Funded, outcome = None, refund_reason = None, requester = operator), emit TaskInitialized
pub fn handle_initialize_task(_ctx: Context<InitializeTask>, _args: InitializeTaskArgs) -> Result<()> {
    todo!("PR-09: initialize_task")
}
