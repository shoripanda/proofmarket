use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ProofMarketError,
    events::VerificationFinalized,
    state::{Config, Outcome, Task, TaskStatus},
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

/// 06 §3.3:
/// - status == Funded (else InvalidStatus). No time check (D-11, P-FIN-03).
/// - roots non-zero (InvalidRoot); recipients <= required_witnesses, <= MAX_RECIPIENTS, unique,
///   no Pubkey::default() (InvalidRecipients)
/// - Verified / NoConsensus: recipients >= quorum; InsufficientWitnesses: 1 <= recipients < quorum;
///   None: no recipient count is valid for it, so it is rejected as InvalidRecipients
/// - status = Finalized, finalized_at = now, emit VerificationFinalized
pub fn handle_finalize_verification(
    ctx: Context<FinalizeVerification>,
    args: FinalizeVerificationArgs,
) -> Result<()> {
    let task_key = ctx.accounts.task.key();
    let task = &mut ctx.accounts.task;
    require!(
        task.status == TaskStatus::Funded,
        ProofMarketError::InvalidStatus
    );
    require!(
        args.evidence_root != [0; 32] && args.result_hash != [0; 32],
        ProofMarketError::InvalidRoot
    );

    let recipients = &args.recipients;
    let count = recipients.len();
    require!(
        count <= usize::from(task.required_witnesses) && count <= MAX_RECIPIENTS,
        ProofMarketError::InvalidRecipients
    );
    for (i, recipient) in recipients.iter().enumerate() {
        require!(
            *recipient != Pubkey::default() && !recipients[..i].contains(recipient),
            ProofMarketError::InvalidRecipients
        );
    }
    let quorum = usize::from(task.quorum);
    let count_ok = match args.outcome {
        Outcome::Verified | Outcome::NoConsensus => count >= quorum,
        Outcome::InsufficientWitnesses => count >= 1 && count < quorum,
        Outcome::None => false,
    };
    require!(count_ok, ProofMarketError::InvalidRecipients);

    let mut stored = [Pubkey::default(); MAX_RECIPIENTS];
    stored[..count].copy_from_slice(recipients);
    // count <= MAX_RECIPIENTS (5), so the cast cannot truncate.
    let recipient_count = count as u8;

    task.outcome = args.outcome;
    task.evidence_root = args.evidence_root;
    task.result_hash = args.result_hash;
    task.recipient_count = recipient_count;
    task.recipients = stored;
    task.status = TaskStatus::Finalized;
    task.finalized_at = Clock::get()?.unix_timestamp;

    emit!(VerificationFinalized {
        task: task_key,
        outcome: args.outcome,
        evidence_root: args.evidence_root,
        result_hash: args.result_hash,
        recipient_count,
    });
    Ok(())
}
