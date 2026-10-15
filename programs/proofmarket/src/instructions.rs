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
use anchor_spl::{
    token::spl_token,
    token_2022::spl_token_2022::{
        self,
        extension::{
            transfer_fee::TransferFeeConfig, transfer_hook::TransferHook, BaseStateWithExtensions,
            ExtensionType, StateWithExtensions,
        },
    },
    token_interface::TokenAccount,
};

use crate::error::ProofMarketError;

/// settle / refund take the vault as an unchecked account so that the task status is checked before the
/// vault is read: once a task is Settled or Refunded the vault is closed, and a second settle / refund must
/// still fail with InvalidStatus (D8-D10) rather than with an account-deserialization error.
/// The address is pinned by the seeds constraint; here we check the owner program (SPL Token or Token-2022,
/// 16 §5) and the layout.
pub(crate) fn load_vault(vault: &AccountInfo) -> Result<TokenAccount> {
    require!(
        *vault.owner == spl_token::ID || *vault.owner == spl_token_2022::ID,
        anchor_lang::error::ErrorCode::AccountOwnedByWrongProgram
    );
    let data = vault.try_borrow_data()?;
    TokenAccount::try_deserialize(&mut &data[..])
}

/// 16 §5.2: a Token-2022 mint may be escrowed only with extensions that cannot hold the funds back. Everything
/// not listed is refused. A transfer fee must be zero in both epochs and a transfer hook must name no program,
/// because either would make the vault hold less than was funded or make settle need accounts it does not take.
/// add_mint checks all of it; initialize_task checks again, since the fee and the hook can change later.
/// An SPL Token mint has no extensions and always passes.
pub(crate) fn check_mint_extensions(mint: &AccountInfo) -> Result<()> {
    if *mint.owner != spl_token_2022::ID {
        return Ok(());
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)?;
    for ext in state.get_extension_types()? {
        match ext {
            ExtensionType::MetadataPointer
            | ExtensionType::TokenMetadata
            | ExtensionType::GroupPointer
            | ExtensionType::TokenGroup
            | ExtensionType::GroupMemberPointer
            | ExtensionType::TokenGroupMember
            | ExtensionType::MintCloseAuthority
            | ExtensionType::ConfidentialTransferMint
            | ExtensionType::ConfidentialTransferFeeConfig
            | ExtensionType::PermanentDelegate
            | ExtensionType::Pausable => {}
            ExtensionType::TransferFeeConfig => {
                let c = state.get_extension::<TransferFeeConfig>()?;
                for fee in [&c.older_transfer_fee, &c.newer_transfer_fee] {
                    require!(
                        u16::from(fee.transfer_fee_basis_points) == 0 && u64::from(fee.maximum_fee) == 0,
                        ProofMarketError::UnsupportedMintExtension
                    );
                }
            }
            ExtensionType::TransferHook => {
                let h = state.get_extension::<TransferHook>()?;
                require!(
                    Option::<Pubkey>::from(h.program_id).is_none(),
                    ProofMarketError::UnsupportedMintExtension
                );
            }
            _ => return err!(ProofMarketError::UnsupportedMintExtension),
        }
    }
    Ok(())
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
