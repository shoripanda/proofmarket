pub mod allowed_mint;
pub mod finalize_verification;
pub mod initialize_config;
pub mod initialize_task;
pub mod refund;
pub mod settle;
pub mod update_config;

pub use allowed_mint::*;
pub use finalize_verification::*;
pub use initialize_config::*;
pub use initialize_task::*;
pub use refund::*;
pub use settle::*;
pub use update_config::*;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};

/// settle / refund take the vault as an unchecked account so that the task status is checked before the
/// vault is read: once a task is Settled or Refunded the vault is closed, and a second settle / refund must
/// still fail with InvalidStatus (D8-D10) rather than with an account-deserialization error.
/// The address is pinned by the seeds constraint; here we check the owner program and the layout.
pub(crate) fn load_vault(vault: &AccountInfo) -> Result<TokenAccount> {
    require_keys_eq!(
        *vault.owner,
        token::ID,
        anchor_lang::error::ErrorCode::AccountOwnedByWrongProgram
    );
    let data = vault.try_borrow_data()?;
    TokenAccount::try_deserialize(&mut &data[..])
}

/// The account the remainder of a settle / refund goes back to: a token account of the task's mint that is
/// Config.treasury (as before v1.2) or owned by the operator, who funded the task (15 §3.1).
pub(crate) fn is_treasury_for(
    treasury: &TokenAccount,
    treasury_key: Pubkey,
    config: &crate::state::Config,
    task_mint: Pubkey,
) -> bool {
    treasury.mint == task_mint && (treasury_key == config.treasury || treasury.owner == config.operator)
}

/// [TASK_SEED, task_id_hash, bump]: the task PDA is the vault authority.
pub(crate) fn task_signer_seeds<'a>(
    task_id_hash: &'a [u8; 32],
    bump: &'a [u8; 1],
) -> [&'a [u8]; 3] {
    [
        crate::constants::TASK_SEED,
        task_id_hash.as_ref(),
        bump.as_ref(),
    ]
}
