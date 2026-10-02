use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ProofMarketError,
    instructions::initialize_config::{validate_keys, validate_max_witnesses},
    state::Config,
};

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
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ProofMarketError::Unauthorized)]
    pub config: Account<'info, Config>,
}

/// Rejects max_witnesses outside 1..=MAX_RECIPIENTS (InvalidWitnessConfig, P-CFG-01), a resulting
/// operator == verifier (Unauthorized), and bounty_mint / treasury given without the other (InvalidTreasury).
pub fn handle_update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;

    let operator = args.operator.unwrap_or(config.operator);
    let verifier = args.verifier.unwrap_or(config.verifier);
    validate_keys(operator, verifier)?;

    if let Some(max_witnesses) = args.max_witnesses {
        validate_max_witnesses(max_witnesses)?;
        config.max_witnesses = max_witnesses;
    }

    match (args.bounty_mint, args.treasury) {
        (Some(bounty_mint), Some(treasury)) => {
            require_keys_neq!(
                bounty_mint,
                Pubkey::default(),
                ProofMarketError::InvalidMint
            );
            require_keys_neq!(
                treasury,
                Pubkey::default(),
                ProofMarketError::InvalidTreasury
            );
            config.bounty_mint = bounty_mint;
            config.treasury = treasury;
        }
        (None, None) => {}
        _ => return err!(ProofMarketError::InvalidTreasury),
    }

    config.operator = operator;
    config.verifier = verifier;
    if let Some(paused) = args.paused {
        config.paused = paused;
    }
    Ok(())
}
