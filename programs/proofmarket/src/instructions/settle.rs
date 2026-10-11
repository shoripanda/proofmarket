use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address,
    token::{self, spl_token::native_mint, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    constants::*,
    error::ProofMarketError,
    events::TaskSettled,
    instructions::{is_treasury_for, load_vault, task_signer_seeds},
    state::{Config, Task, TaskStatus},
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
    /// Read only after the status check, so a settle after the vault was closed fails with InvalidStatus (D8, D10).
    /// CHECK: address pinned by seeds; owner and layout are checked by `load_vault`.
    #[account(mut, seeds = [VAULT_SEED, task.key().as_ref()], bump = task.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = is_treasury_for(&treasury, treasury.key(), &config, task.mint) @ ProofMarketError::InvalidTreasury
    )]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    // remaining_accounts: recipients' ATAs (writable), same order as task.recipients[..recipient_count]
}

/// 06 §3.4:
/// - status == Finalized (else InvalidStatus) — Settled/Refunded can never be settled again (D8, D10)
/// - remaining_accounts.len() == recipient_count (RecipientCountMismatch)
/// - each account == get_associated_token_address(recipients[i], mint), is owned by the token program, is
///   writable, and its mint and owner match (RecipientAccountMismatch). All are checked before any transfer.
/// - amount_per_witness * recipient_count <= vault.amount; pay each, remainder -> treasury, close vault -> operator
/// - status = Settled, paid_total, closed_at; emit TaskSettled
///
/// 15 §3.1, wSOL tasks: recipients get native SOL in their wallets, so a fresh wallet needs no token account
/// and nothing to unwrap. remaining_accounts are then the recipient wallets themselves (writable, owned by the
/// system program). The remainder goes to the treasury as wSOL, the vault is closed into the task account (its
/// rent plus the wrapped payout become lamports there), and the program, which owns the task account, moves
/// amount_per_witness to each wallet and the vault's rent to the operator.
pub fn handle_settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
    let task = &ctx.accounts.task;
    require!(
        task.status == TaskStatus::Finalized,
        ProofMarketError::InvalidStatus
    );

    let recipient_count = usize::from(task.recipient_count);
    let recipient_accounts = ctx.remaining_accounts;
    require!(
        recipient_accounts.len() == recipient_count,
        ProofMarketError::RecipientCountMismatch
    );
    let native = task.mint == native_mint::ID;
    for (account, recipient) in recipient_accounts
        .iter()
        .zip(task.recipients[..recipient_count].iter())
    {
        if native {
            require!(
                account.key() == *recipient
                    && account.is_writable
                    && *account.owner == anchor_lang::system_program::ID,
                ProofMarketError::RecipientAccountMismatch
            );
            // The runtime rejects a lamport balance between 0 and the rent-exempt minimum; say why up front.
            if account.lamports() == 0 {
                require!(
                    task.amount_per_witness >= Rent::get()?.minimum_balance(0),
                    ProofMarketError::PayoutBelowRent
                );
            }
            continue;
        }
        require_keys_eq!(
            account.key(),
            get_associated_token_address(recipient, &task.mint),
            ProofMarketError::RecipientAccountMismatch
        );
        require!(
            *account.owner == token::ID && account.is_writable,
            ProofMarketError::RecipientAccountMismatch
        );
        let data = account.try_borrow_data()?;
        let token_account = TokenAccount::try_deserialize(&mut &data[..])
            .map_err(|_| error!(ProofMarketError::RecipientAccountMismatch))?;
        require!(
            token_account.mint == task.mint && token_account.owner == *recipient,
            ProofMarketError::RecipientAccountMismatch
        );
    }

    let vault_amount = load_vault(&ctx.accounts.vault)?.amount;
    let paid_total = task
        .amount_per_witness
        .checked_mul(u64::from(task.recipient_count))
        .ok_or(ProofMarketError::AmountOverflow)?;
    let remainder = vault_amount
        .checked_sub(paid_total)
        .ok_or(ProofMarketError::InsufficientVaultBalance)?;

    let task_key = task.key();
    let amount_per_witness = task.amount_per_witness;
    let task_id_hash = task.task_id_hash;
    let bump = [task.bump];
    let seeds = task_signer_seeds(&task_id_hash, &bump);
    let signer: &[&[&[u8]]] = &[&seeds];

    let token_program = ctx.accounts.token_program.key();
    let vault = ctx.accounts.vault.to_account_info();
    let authority = ctx.accounts.task.to_account_info();
    if native {
        return settle_native(ctx, paid_total, remainder);
    }
    for account in recipient_accounts {
        token::transfer(
            CpiContext::new_with_signer(
                token_program,
                Transfer {
                    from: vault.clone(),
                    to: account.clone(),
                    authority: authority.clone(),
                },
                signer,
            ),
            amount_per_witness,
        )?;
    }
    if remainder > 0 {
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
            remainder,
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
    task.paid_total = paid_total;
    task.closed_at = Clock::get()?.unix_timestamp;
    task.status = TaskStatus::Settled;

    emit!(TaskSettled {
        task: task_key,
        paid_total,
        remainder,
    });
    Ok(())
}

/// The wSOL branch of settle (see handle_settle). Every check has already passed.
fn settle_native<'info>(ctx: Context<'info, Settle<'info>>, paid_total: u64, remainder: u64) -> Result<()> {
    let task = &ctx.accounts.task;
    let task_key = task.key();
    let amount_per_witness = task.amount_per_witness;
    let task_id_hash = task.task_id_hash;
    let bump = [task.bump];
    let seeds = task_signer_seeds(&task_id_hash, &bump);
    let signer: &[&[&[u8]]] = &[&seeds];
    let token_program = ctx.accounts.token_program.key();
    let vault = ctx.accounts.vault.to_account_info();
    let task_info = ctx.accounts.task.to_account_info();

    if remainder > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                token_program,
                Transfer {
                    from: vault.clone(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: task_info.clone(),
                },
                signer,
            ),
            remainder,
        )?;
    }
    // A native token account may be closed with a balance: all its lamports (rent + paid_total) go to the task.
    let vault_lamports = vault.lamports();
    let vault_rent = vault_lamports
        .checked_sub(paid_total)
        .ok_or(ProofMarketError::InsufficientVaultBalance)?;
    token::close_account(CpiContext::new_with_signer(
        token_program,
        CloseAccount {
            account: vault,
            destination: task_info.clone(),
            authority: task_info.clone(),
        },
        signer,
    ))?;
    for account in ctx.remaining_accounts {
        **task_info.try_borrow_mut_lamports()? -= amount_per_witness;
        **account.try_borrow_mut_lamports()? += amount_per_witness;
    }
    **task_info.try_borrow_mut_lamports()? -= vault_rent;
    **ctx.accounts.operator.to_account_info().try_borrow_mut_lamports()? += vault_rent;

    let task = &mut ctx.accounts.task;
    task.paid_total = paid_total;
    task.closed_at = Clock::get()?.unix_timestamp;
    task.status = TaskStatus::Settled;
    emit!(TaskSettled {
        task: task_key,
        paid_total,
        remainder,
    });
    Ok(())
}
