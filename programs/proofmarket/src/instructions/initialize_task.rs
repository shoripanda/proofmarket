use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::*,
    error::ProofMarketError,
    events::TaskInitialized,
    instructions::check_mint_extensions,
    state::{AllowedMint, Config, Outcome, RefundReason, Task, TaskStatus},
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
    /// Config.bounty_mint, or a mint whose AllowedMint is passed as `allowed_mint` (15 §3.1). SPL Token or
    /// Token-2022 (16 §5); the token program passed must be the one that owns it.
    #[account(
        constraint = mint.key() == config.bounty_mint || allowed_mint.is_some() @ ProofMarketError::InvalidMint,
        constraint = *mint.to_account_info().owner == token_program.key() @ ProofMarketError::InvalidMint
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = operator,
        seeds = [VAULT_SEED, task.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = task,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// Config.treasury for Config.bounty_mint; for an allowed mint, an operator-owned account of that mint.
    #[account(
        mut,
        constraint = treasury.mint == mint.key() @ ProofMarketError::InvalidTreasury,
        constraint = (mint.key() == config.bounty_mint && treasury.key() == config.treasury)
            || (mint.key() != config.bounty_mint && treasury.owner == config.operator) @ ProofMarketError::InvalidTreasury
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    /// Last and optional so clients from before v1.2 may leave it out (allow-missing-optionals).
    #[account(seeds = [MINT_SEED, mint.key().as_ref()], bump = allowed_mint.bump)]
    pub allowed_mint: Option<Account<'info, AllowedMint>>,
}

/// 06 §3.2:
/// - !config.paused; amount_per_witness > 0; 1 <= quorum <= required_witnesses <= config.max_witnesses
/// - deadline > Clock::unix_timestamp; total = amount_per_witness.checked_mul(required_witnesses)
/// - transfer total treasury -> vault (operator signs as treasury owner)
/// - write Task (status = Funded, outcome = None, refund_reason = None, requester = operator), emit TaskInitialized
pub fn handle_initialize_task(
    ctx: Context<InitializeTask>,
    args: InitializeTaskArgs,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, ProofMarketError::Paused);
    require!(args.amount_per_witness > 0, ProofMarketError::InvalidAmount);
    require!(
        args.quorum >= 1
            && args.quorum <= args.required_witnesses
            && args.required_witnesses <= config.max_witnesses,
        ProofMarketError::InvalidWitnessConfig
    );
    let now = Clock::get()?.unix_timestamp;
    require!(args.deadline > now, ProofMarketError::DeadlineInPast);
    let amount_total = args
        .amount_per_witness
        .checked_mul(u64::from(args.required_witnesses))
        .ok_or(ProofMarketError::AmountOverflow)?;
    // 16 §5.2: the fee and the hook of a Token-2022 mint can change after add_mint; look again.
    check_mint_extensions(&ctx.accounts.mint.to_account_info())?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.treasury.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.operator.to_account_info(),
            },
        ),
        amount_total,
        ctx.accounts.mint.decimals,
    )?;

    let task_key = ctx.accounts.task.key();
    let task = &mut ctx.accounts.task;
    task.version = TASK_VERSION;
    task.bump = ctx.bumps.task;
    task.vault_bump = ctx.bumps.vault;
    task.task_id_hash = args.task_id_hash;
    task.requester = ctx.accounts.operator.key();
    task.requester_ref_hash = args.requester_ref_hash;
    task.mint = ctx.accounts.mint.key();
    task.amount_per_witness = args.amount_per_witness;
    task.required_witnesses = args.required_witnesses;
    task.quorum = args.quorum;
    task.deadline = args.deadline;
    task.status = TaskStatus::Funded;
    task.outcome = Outcome::None;
    task.refund_reason = RefundReason::None;
    task.evidence_root = [0; 32];
    task.result_hash = [0; 32];
    task.recipient_count = 0;
    task.recipients = [Pubkey::default(); MAX_RECIPIENTS];
    task.paid_total = 0;
    task.created_at = now;
    task.finalized_at = 0;
    task.closed_at = 0;

    emit!(TaskInitialized {
        task: task_key,
        task_id_hash: args.task_id_hash,
        amount_total,
        deadline: args.deadline,
    });
    Ok(())
}
