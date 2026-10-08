use anchor_lang::prelude::*;

/// 06 §3.6
#[error_code]
pub enum ProofMarketError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Signer is not authorized for this instruction")]
    Unauthorized,
    #[msg("Mint is not the configured bounty mint")]
    InvalidMint,
    #[msg("Treasury account does not match config")]
    InvalidTreasury,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Require 1 <= quorum <= required_witnesses <= max_witnesses")]
    InvalidWitnessConfig,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Arithmetic overflow")]
    AmountOverflow,
    #[msg("Instruction not allowed in the current task status")]
    InvalidStatus,
    #[msg("evidence_root and result_hash must be non-zero")]
    InvalidRoot,
    #[msg("Recipients are duplicated, default, too many or too few for the outcome")]
    InvalidRecipients,
    #[msg("remaining_accounts length differs from recipient_count")]
    RecipientCountMismatch,
    #[msg("Recipient token account is not the expected ATA / mint / owner")]
    RecipientAccountMismatch,
    #[msg("Vault balance is insufficient for the payout")]
    InsufficientVaultBalance,
    #[msg("Task deadline has not passed")]
    NotExpired,
    #[msg("Finalized amount_per_witness may not exceed the funded amount")]
    AmountIncrease,
}
