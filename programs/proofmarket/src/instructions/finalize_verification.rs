use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ProofMarketError,
    state::{Config, Outcome, Task},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FinalizeVerificationArgs {
    pub outcome: Outcome,
    pub evidence_root: [u8; 32],
    pub result_hash: [u8; 32],
    pub recipients: Vec<Pubkey>,
}

#[derive(Accounts)]
pub struct FinalizeVerification<'info> {
    #[account(address = config.verifier @ ProofMarketError::Unauthorized)]
    pub verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TASK_SEED, task.task_id_hash.as_ref()], bump = task.bump)]
    pub task: Account<'info, Task>,
}

/// PR-09 (06 §3.3):
/// - status == Funded (else InvalidStatus). No time check (D-11, P-FIN-03).
/// - roots non-zero; recipients <= required_witnesses, <= MAX_RECIPIENTS, unique, no Pubkey::default()
/// - Verified / NoConsensus: recipients >= quorum; InsufficientWitnesses: 1 <= recipients < quorum; None: reject
/// - status = Finalized, finalized_at = now, emit VerificationFinalized
pub fn handle_finalize_verification(_ctx: Context<FinalizeVerification>, _args: FinalizeVerificationArgs) -> Result<()> {
    todo!("PR-09: finalize_verification")
}
