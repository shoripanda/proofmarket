//! ProofMarket on-chain program: per-task escrow, result attestation, settle XOR refund.
//! Design: specs/proofmarket/implementation/ja/06-solana-program-design.md
//!
//! Only public-verifiable minimum lives here (06 §1): no photos, coordinates, question text,
//! or worker/requester identity. The verifier is a single platform key (disclosed, not decentralized).

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s");

#[program]
pub mod proofmarket {
    use super::*;

    /// admin: create Config (06 §3.1).
    pub fn initialize_config(ctx: Context<InitializeConfig>, args: InitializeConfigArgs) -> Result<()> {
        instructions::initialize_config::handle_initialize_config(ctx, args)
    }

    /// admin: rotate operator / verifier, pause, change max_witnesses (<= MAX_RECIPIENTS) or bounty mint.
    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        instructions::update_config::handle_update_config(ctx, args)
    }

    /// operator: create Task + vault, move amount_per_witness * N from treasury into the vault. -> Funded
    pub fn initialize_task(ctx: Context<InitializeTask>, args: InitializeTaskArgs) -> Result<()> {
        instructions::initialize_task::handle_initialize_task(ctx, args)
    }

    /// verifier: write outcome, evidence_root, result_hash, recipients. Funded -> Finalized. No time limit (D-11).
    pub fn finalize_verification(ctx: Context<FinalizeVerification>, args: FinalizeVerificationArgs) -> Result<()> {
        instructions::finalize_verification::handle_finalize_verification(ctx, args)
    }

    /// operator: pay each recipient amount_per_witness, return remainder, close vault. Finalized -> Settled.
    /// remaining_accounts = recipients' ATAs in the order of task.recipients.
    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        instructions::settle::handle_settle(ctx)
    }

    /// operator: return everything to treasury, close vault. Funded -> Refunded.
    pub fn refund(ctx: Context<Refund>, reason: RefundReason) -> Result<()> {
        instructions::refund::handle_refund(ctx, reason)
    }
}
