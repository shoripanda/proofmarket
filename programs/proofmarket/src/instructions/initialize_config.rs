use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::{constants::*, state::Config};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeConfigArgs {
    pub operator: Pubkey,
    pub verifier: Pubkey,
    pub max_witnesses: u8,
}

#[derive(Accounts)]
#[instruction(args: InitializeConfigArgs)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub bounty_mint: Account<'info, Mint>,
    #[account(
        token::mint = bounty_mint,
        token::authority = args.operator,
    )]
    pub treasury: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

/// PR-09: require operator != verifier, 1 <= max_witnesses <= MAX_RECIPIENTS; write all fields; paused = false.
pub fn handle_initialize_config(_ctx: Context<InitializeConfig>, _args: InitializeConfigArgs) -> Result<()> {
    todo!("PR-09: initialize_config")
}
