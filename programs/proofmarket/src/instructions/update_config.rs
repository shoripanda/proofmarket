use anchor_lang::prelude::*;

use crate::{constants::*, state::Config};

/// None = unchanged. bounty_mint and treasury must be changed together (06 §6 own-mint fallback).
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigArgs {
    pub operator: Option<Pubkey>,
    pub verifier: Option<Pubkey>,
    pub paused: Option<bool>,
    pub max_witnesses: Option<u8>,
    pub bounty_mint: Option<Pubkey>,
    pub treasury: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

/// PR-09: reject max_witnesses > MAX_RECIPIENTS (P-CFG-01), operator == verifier,
/// and bounty_mint / treasury given without the other.
pub fn handle_update_config(_ctx: Context<UpdateConfig>, _args: UpdateConfigArgs) -> Result<()> {
    todo!("PR-09: update_config")
}
