use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::{constants::*, error::ProofMarketError, state::Config};

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

/// 06 §2.1, §3.1: require operator != verifier (Unauthorized), 1 <= max_witnesses <= MAX_RECIPIENTS
/// (InvalidWitnessConfig); write all fields; paused = false.
pub fn handle_initialize_config(
    ctx: Context<InitializeConfig>,
    args: InitializeConfigArgs,
) -> Result<()> {
    validate_keys(args.operator, args.verifier)?;
    validate_max_witnesses(args.max_witnesses)?;

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.operator = args.operator;
    config.verifier = args.verifier;
    config.bounty_mint = ctx.accounts.bounty_mint.key();
    config.treasury = ctx.accounts.treasury.key();
    config.max_witnesses = args.max_witnesses;
    config.paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}

/// The operator / verifier split is the point of the key design (06 §2.1): one key alone must not be able to
/// both choose the recipients and move the vault. Same key or the default key -> Unauthorized.
pub(crate) fn validate_keys(operator: Pubkey, verifier: Pubkey) -> Result<()> {
    require_keys_neq!(operator, Pubkey::default(), ProofMarketError::Unauthorized);
    require_keys_neq!(verifier, Pubkey::default(), ProofMarketError::Unauthorized);
    require_keys_neq!(operator, verifier, ProofMarketError::Unauthorized);
    Ok(())
}

/// Task.recipients is a fixed [Pubkey; MAX_RECIPIENTS]; a larger cap could never be honored (P-CFG-01).
pub(crate) fn validate_max_witnesses(max_witnesses: u8) -> Result<()> {
    require!(
        max_witnesses >= 1 && usize::from(max_witnesses) <= MAX_RECIPIENTS,
        ProofMarketError::InvalidWitnessConfig
    );
    Ok(())
}
