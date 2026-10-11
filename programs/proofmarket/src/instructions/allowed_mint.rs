use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{
    constants::*,
    error::ProofMarketError,
    state::{AllowedMint, Config},
};

/// admin: allow tasks in `mint` (15 §3.1). `init` fails if it is already allowed.
#[derive(Accounts)]
pub struct AddMint<'info> {
    #[account(mut, address = config.admin @ ProofMarketError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + AllowedMint::INIT_SPACE,
        seeds = [MINT_SEED, mint.key().as_ref()],
        bump
    )]
    pub allowed_mint: Account<'info, AllowedMint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_add_mint(ctx: Context<AddMint>) -> Result<()> {
    let a = &mut ctx.accounts.allowed_mint;
    a.mint = ctx.accounts.mint.key();
    a.bump = ctx.bumps.allowed_mint;
    Ok(())
}

/// admin: stop new tasks in `mint`. Tasks already funded in it still settle or refund.
#[derive(Accounts)]
pub struct RemoveMint<'info> {
    #[account(mut, address = config.admin @ ProofMarketError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = admin, seeds = [MINT_SEED, allowed_mint.mint.as_ref()], bump = allowed_mint.bump)]
    pub allowed_mint: Account<'info, AllowedMint>,
}

pub fn handle_remove_mint(_ctx: Context<RemoveMint>) -> Result<()> {
    Ok(())
}
