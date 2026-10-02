use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ProofMarketError,
    events::TaskRefunded,
    instructions::{load_vault, task_signer_seeds},
    state::{Config, RefundReason, Task, TaskStatus},
};

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut, address = config.operator @ ProofMarketError::Unauthorized)]
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TASK_SEED, task.task_id_hash.as_ref()], bump = task.bump)]
    pub task: Account<'info, Task>,
    /// Read only after the status check, so a refund after the vault was closed fails with InvalidStatus (D9).
    /// CHECK: address pinned by seeds; owner and layout are checked by `load_vault`.
    #[account(mut, seeds = [VAULT_SEED, task.key().as_ref()], bump = task.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut, address = config.treasury @ ProofMarketError::InvalidTreasury)]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// 06 §3.5:
/// - status == Funded (else InvalidStatus) — a Finalized/Settled task can never be refunded (D9)
/// - reason None is rejected as InvalidStatus (a Refunded task must say why)
/// - reason == Expired requires Clock::unix_timestamp > deadline (NotExpired)
/// - transfer all vault -> treasury, close vault -> operator, status = Refunded; emit TaskRefunded
/// Trust note: the operator may refund a Funded task at any time as Cancelled; off-chain T15 guards this (disclosed).
pub fn handle_refund(ctx: Context<Refund>, reason: RefundReason) -> Result<()> {
    let task = &ctx.accounts.task;
    require!(
        task.status == TaskStatus::Funded,
        ProofMarketError::InvalidStatus
    );
    require!(
        reason != RefundReason::None,
        ProofMarketError::InvalidStatus
    );
    let now = Clock::get()?.unix_timestamp;
    if reason == RefundReason::Expired {
        require!(now > task.deadline, ProofMarketError::NotExpired);
    }

    let amount = load_vault(&ctx.accounts.vault)?.amount;
    let task_key = task.key();
    let task_id_hash = task.task_id_hash;
    let bump = [task.bump];
    let seeds = task_signer_seeds(&task_id_hash, &bump);
    let signer: &[&[&[u8]]] = &[&seeds];

    let token_program = ctx.accounts.token_program.key();
    let vault = ctx.accounts.vault.to_account_info();
    let authority = ctx.accounts.task.to_account_info();
    if amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                token_program,
                Transfer {
                    from: vault.clone(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: authority.clone(),
                },
                signer,
            ),
            amount,
        )?;
    }
    token::close_account(CpiContext::new_with_signer(
        token_program,
        CloseAccount {
            account: vault,
            destination: ctx.accounts.operator.to_account_info(),
            authority,
        },
        signer,
    ))?;

    let task = &mut ctx.accounts.task;
    task.refund_reason = reason;
    task.closed_at = now;
    task.status = TaskStatus::Refunded;

    emit!(TaskRefunded {
        task: task_key,
        amount,
        reason,
    });
    Ok(())
}
