//! LiteSVM tests for 09-test-plan.md §3.2 (P-*) and §2 D8-D10.
//! Build the program first (`anchor build`); tests load target/deploy/proofmarket.so.
//!
//! Every negative case asserts the exact error code (ProofMarketError = 6000 + index, see the IDL),
//! not just that the transaction failed.

use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::{
        instruction::{error::InstructionError, AccountMeta, Instruction},
        program_option::COption,
        program_pack::Pack,
    },
    AccountDeserialize, AnchorDeserialize, Discriminator, InstructionData, ToAccountMetas,
};
use anchor_spl::{associated_token::get_associated_token_address, token::spl_token};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use litesvm::{types::TransactionResult, LiteSVM};
use proofmarket::{
    error::ProofMarketError,
    events::{TaskInitialized, TaskRefunded, TaskSettled, VerificationFinalized},
    FinalizeVerificationArgs, InitializeConfigArgs, InitializeTaskArgs, Outcome, RefundReason,
    Task, TaskStatus, UpdateConfigArgs, CONFIG_SEED, MAX_RECIPIENTS, TASK_SEED, VAULT_SEED,
};
use solana_account::Account as SolanaAccount;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

const SO_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../target/deploy/proofmarket.so"
);
/// Tests run at a realistic wall clock so that "past" deadlines are representable.
const NOW: i64 = 1_800_000_000;
const DAY: i64 = 86_400;
/// 1 USDC in base units.
const AMOUNT: u64 = 1_000_000;
const TREASURY_START: u64 = 1_000 * AMOUNT;
const SOL: u64 = 1_000_000_000;

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

fn code(e: ProofMarketError) -> u32 {
    e.into()
}

/// SystemError::AccountAlreadyInUse — what `init` returns when the PDA already exists.
const SYSTEM_ACCOUNT_ALREADY_IN_USE: u32 = 0;

#[track_caller]
fn assert_custom_err(res: TransactionResult, expected: u32) {
    match res {
        Ok(meta) => panic!(
            "expected custom error {expected}, but the transaction succeeded: {:#?}",
            meta.logs
        ),
        Err(failed) => match failed.err {
            TransactionError::InstructionError(_, InstructionError::Custom(actual)) => {
                assert_eq!(
                    actual, expected,
                    "wrong error code; logs: {:#?}",
                    failed.meta.logs
                )
            }
            other => panic!(
                "expected custom error {expected}, got {other:?}; logs: {:#?}",
                failed.meta.logs
            ),
        },
    }
}

#[track_caller]
fn assert_err(res: TransactionResult, expected: ProofMarketError) {
    assert_custom_err(res, code(expected));
}

#[track_caller]
fn assert_ok(res: TransactionResult) -> Vec<String> {
    match res {
        Ok(meta) => meta.logs,
        Err(failed) => panic!(
            "transaction failed: {:?}; logs: {:#?}",
            failed.err, failed.meta.logs
        ),
    }
}

/// Decodes the first Anchor event of type `E` from "Program data:" log lines.
fn find_event<E: AnchorDeserialize + Discriminator>(logs: &[String]) -> Option<E> {
    logs.iter().find_map(|line| {
        let data = BASE64.decode(line.strip_prefix("Program data: ")?).ok()?;
        let body = data.strip_prefix(E::DISCRIMINATOR)?;
        E::deserialize(&mut &body[..]).ok()
    })
}

fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &proofmarket::ID).0
}

fn task_pda(task_id_hash: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[TASK_SEED, task_id_hash.as_ref()], &proofmarket::ID).0
}

fn vault_pda(task: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[VAULT_SEED, task.as_ref()], &proofmarket::ID).0
}

fn hash(seed: u8) -> [u8; 32] {
    [seed; 32]
}

fn task_args(seed: u8) -> InitializeTaskArgs {
    InitializeTaskArgs {
        task_id_hash: hash(seed),
        requester_ref_hash: [0xAB; 32],
        amount_per_witness: AMOUNT,
        required_witnesses: 3,
        quorum: 2,
        deadline: NOW + DAY,
    }
}

fn finalize_args(outcome: Outcome, recipients: Vec<Pubkey>) -> FinalizeVerificationArgs {
    FinalizeVerificationArgs {
        outcome,
        evidence_root: [0x11; 32],
        result_hash: [0x22; 32],
        recipients,
        amount_per_witness: None,
    }
}

fn no_config_change() -> UpdateConfigArgs {
    UpdateConfigArgs {
        operator: None,
        verifier: None,
        paused: None,
        max_witnesses: None,
        bounty_mint: None,
        treasury: None,
    }
}

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    operator: Keypair,
    verifier: Keypair,
    mint: Pubkey,
    treasury: Pubkey,
}

impl Env {
    /// Program + SPL Token, clock at NOW, a 6-decimal mint, the operator-owned treasury ATA holding
    /// TREASURY_START, and an initialized Config (max_witnesses = MAX_RECIPIENTS).
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(proofmarket::ID, SO_PATH)
            .expect("target/deploy/proofmarket.so is missing: run `anchor build` first");
        let mut clock = svm.get_sysvar::<Clock>();
        clock.unix_timestamp = NOW;
        svm.set_sysvar(&clock);

        let admin = Keypair::new();
        let operator = Keypair::new();
        let verifier = Keypair::new();
        for kp in [&admin, &operator, &verifier] {
            svm.airdrop(&kp.pubkey(), 10 * SOL).unwrap();
        }

        let mut env = Env {
            svm,
            admin,
            operator,
            verifier,
            mint: Pubkey::default(),
            treasury: Pubkey::default(),
        };
        env.mint = env.new_mint();
        let (operator, mint) = (env.operator.pubkey(), env.mint);
        env.treasury = env.new_ata(&operator, &mint, TREASURY_START);

        let ix = env.ix_initialize_config(InitializeConfigArgs {
            operator: env.operator.pubkey(),
            verifier: env.verifier.pubkey(),
            max_witnesses: MAX_RECIPIENTS as u8,
        });
        let admin = env.admin.insecure_clone();
        assert_ok(env.send(&[ix], &admin));
        env
    }

    fn send(&mut self, ixs: &[Instruction], payer: &Keypair) -> TransactionResult {
        // A fresh blockhash per send: identical retries must not be rejected as AlreadyProcessed.
        self.svm.expire_blockhash();
        let tx = Transaction::new_signed_with_payer(
            ixs,
            Some(&payer.pubkey()),
            &[payer],
            self.svm.latest_blockhash(),
        );
        self.svm.send_transaction(tx)
    }

    fn set_clock(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }

    fn new_mint(&mut self) -> Pubkey {
        let mint = Pubkey::new_unique();
        let state = spl_token::state::Mint {
            mint_authority: COption::Some(self.admin.pubkey()),
            supply: u64::MAX / 2,
            decimals: 6,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        let mut data = vec![0u8; spl_token::state::Mint::LEN];
        spl_token::state::Mint::pack(state, &mut data).unwrap();
        self.put_token_program_account(mint, data);
        mint
    }

    /// Writes an initialized SPL token account at `address` (any address, so tests can forge one).
    fn put_token_account(&mut self, address: Pubkey, mint: &Pubkey, owner: &Pubkey, amount: u64) {
        let state = spl_token::state::Account {
            mint: *mint,
            owner: *owner,
            amount,
            delegate: COption::None,
            state: spl_token::state::AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        };
        let mut data = vec![0u8; spl_token::state::Account::LEN];
        spl_token::state::Account::pack(state, &mut data).unwrap();
        self.put_token_program_account(address, data);
    }

    fn put_token_program_account(&mut self, address: Pubkey, data: Vec<u8>) {
        let lamports = self.svm.minimum_balance_for_rent_exemption(data.len());
        self.svm
            .set_account(
                address,
                SolanaAccount {
                    lamports,
                    data,
                    owner: spl_token::ID,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .unwrap();
    }

    fn new_ata(&mut self, owner: &Pubkey, mint: &Pubkey, amount: u64) -> Pubkey {
        let ata = get_associated_token_address(owner, mint);
        self.put_token_account(ata, mint, owner, amount);
        ata
    }

    /// `n` fresh worker wallets with empty ATAs of the bounty mint.
    fn new_recipients(&mut self, n: usize) -> (Vec<Pubkey>, Vec<Pubkey>) {
        let wallets: Vec<Pubkey> = (0..n).map(|_| Pubkey::new_unique()).collect();
        let mint = self.mint;
        let atas = wallets.iter().map(|w| self.new_ata(w, &mint, 0)).collect();
        (wallets, atas)
    }

    fn token_balance(&self, address: &Pubkey) -> u64 {
        let account = self.svm.get_account(address).expect("token account exists");
        spl_token::state::Account::unpack(&account.data)
            .unwrap()
            .amount
    }

    fn is_closed(&self, address: &Pubkey) -> bool {
        self.svm
            .get_account(address)
            .is_none_or(|a| a.lamports == 0 && a.data.is_empty())
    }

    fn task(&self, task: &Pubkey) -> Task {
        let account = self.svm.get_account(task).expect("task exists");
        Task::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    // --- instruction builders --------------------------------------------------------------

    fn ix_initialize_config(&self, args: InitializeConfigArgs) -> Instruction {
        Instruction {
            program_id: proofmarket::ID,
            accounts: proofmarket::accounts::InitializeConfig {
                admin: self.admin.pubkey(),
                config: config_pda(),
                bounty_mint: self.mint,
                treasury: self.treasury,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: proofmarket::instruction::InitializeConfig { args }.data(),
        }
    }

    fn ix_update_config(&self, admin: &Pubkey, args: UpdateConfigArgs) -> Instruction {
        Instruction {
            program_id: proofmarket::ID,
            accounts: proofmarket::accounts::UpdateConfig {
                admin: *admin,
                config: config_pda(),
            }
            .to_account_metas(None),
            data: proofmarket::instruction::UpdateConfig { args }.data(),
        }
    }

    fn ix_initialize_task_with(
        &self,
        operator: &Pubkey,
        mint: &Pubkey,
        treasury: &Pubkey,
        args: InitializeTaskArgs,
    ) -> Instruction {
        let task = task_pda(&args.task_id_hash);
        Instruction {
            program_id: proofmarket::ID,
            accounts: proofmarket::accounts::InitializeTask {
                operator: *operator,
                config: config_pda(),
                task,
                mint: *mint,
                vault: vault_pda(&task),
                treasury: *treasury,
                token_program: spl_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: proofmarket::instruction::InitializeTask { args }.data(),
        }
    }

    fn ix_initialize_task(&self, args: InitializeTaskArgs) -> Instruction {
        self.ix_initialize_task_with(&self.operator.pubkey(), &self.mint, &self.treasury, args)
    }

    fn ix_finalize_with(
        &self,
        verifier: &Pubkey,
        task: &Pubkey,
        args: FinalizeVerificationArgs,
    ) -> Instruction {
        Instruction {
            program_id: proofmarket::ID,
            accounts: proofmarket::accounts::FinalizeVerification {
                verifier: *verifier,
                config: config_pda(),
                task: *task,
            }
            .to_account_metas(None),
            data: proofmarket::instruction::FinalizeVerification { args }.data(),
        }
    }

    fn ix_finalize(&self, task: &Pubkey, args: FinalizeVerificationArgs) -> Instruction {
        self.ix_finalize_with(&self.verifier.pubkey(), task, args)
    }

    fn ix_settle_metas(&self, task: &Pubkey, recipient_metas: Vec<AccountMeta>) -> Instruction {
        let mut accounts = proofmarket::accounts::Settle {
            operator: self.operator.pubkey(),
            config: config_pda(),
            task: *task,
            mint: self.mint,
            vault: vault_pda(task),
            treasury: self.treasury,
            token_program: spl_token::ID,
        }
        .to_account_metas(None);
        accounts.extend(recipient_metas);
        Instruction {
            program_id: proofmarket::ID,
            accounts,
            data: proofmarket::instruction::Settle {}.data(),
        }
    }

    fn ix_settle(&self, task: &Pubkey, recipient_atas: &[Pubkey]) -> Instruction {
        let metas = recipient_atas
            .iter()
            .map(|a| AccountMeta::new(*a, false))
            .collect();
        self.ix_settle_metas(task, metas)
    }

    fn ix_refund(&self, task: &Pubkey, reason: RefundReason) -> Instruction {
        Instruction {
            program_id: proofmarket::ID,
            accounts: proofmarket::accounts::Refund {
                operator: self.operator.pubkey(),
                config: config_pda(),
                task: *task,
                vault: vault_pda(task),
                treasury: self.treasury,
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: proofmarket::instruction::Refund { reason }.data(),
        }
    }

    // --- signed senders --------------------------------------------------------------------

    fn as_operator(&mut self, ix: Instruction) -> TransactionResult {
        let operator = self.operator.insecure_clone();
        self.send(&[ix], &operator)
    }

    fn as_verifier(&mut self, ix: Instruction) -> TransactionResult {
        let verifier = self.verifier.insecure_clone();
        self.send(&[ix], &verifier)
    }

    fn as_admin(&mut self, ix: Instruction) -> TransactionResult {
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &admin)
    }

    // --- flows -----------------------------------------------------------------------------

    fn fund(&mut self, args: InitializeTaskArgs) -> Pubkey {
        let task = task_pda(&args.task_id_hash);
        let ix = self.ix_initialize_task(args);
        assert_ok(self.as_operator(ix));
        task
    }

    fn finalize(&mut self, task: &Pubkey, outcome: Outcome, recipients: &[Pubkey]) {
        let ix = self.ix_finalize(task, finalize_args(outcome, recipients.to_vec()));
        assert_ok(self.as_verifier(ix));
    }

    /// Funded (N=3, Q=2) -> Finalized(Verified) with 2 recipients. Returns (task, recipient ATAs).
    fn finalized_task(&mut self, seed: u8) -> (Pubkey, Vec<Pubkey>) {
        let task = self.fund(task_args(seed));
        let (wallets, atas) = self.new_recipients(2);
        self.finalize(&task, Outcome::Verified, &wallets);
        (task, atas)
    }
}

// ---------------------------------------------------------------------------------------------
// initialize_task (06 §3.2)
// ---------------------------------------------------------------------------------------------

#[test]
fn p_init_01_funds_vault() {
    let mut env = Env::new();
    let args = task_args(1);
    let task = task_pda(&args.task_id_hash);
    let ix = env.ix_initialize_task(args.clone());
    let logs = assert_ok(env.as_operator(ix));

    let total = AMOUNT * 3;
    assert_eq!(env.token_balance(&vault_pda(&task)), total);
    assert_eq!(env.token_balance(&env.treasury), TREASURY_START - total);

    let t = env.task(&task);
    assert_eq!(t.version, proofmarket::TASK_VERSION);
    assert_eq!(t.task_id_hash, args.task_id_hash);
    assert_eq!(t.requester, env.operator.pubkey());
    assert_eq!(t.requester_ref_hash, args.requester_ref_hash);
    assert_eq!(t.mint, env.mint);
    assert_eq!(t.amount_per_witness, AMOUNT);
    assert_eq!((t.required_witnesses, t.quorum), (3, 2));
    assert_eq!(t.deadline, NOW + DAY);
    assert_eq!(t.status, TaskStatus::Funded);
    assert_eq!(t.outcome, Outcome::None);
    assert_eq!(t.refund_reason, RefundReason::None);
    assert_eq!(t.recipient_count, 0);
    assert_eq!(t.paid_total, 0);
    assert_eq!((t.created_at, t.finalized_at, t.closed_at), (NOW, 0, 0));
    assert_eq!(
        t.bump,
        Pubkey::find_program_address(&[TASK_SEED, &args.task_id_hash], &proofmarket::ID).1
    );
    assert_eq!(
        t.vault_bump,
        Pubkey::find_program_address(&[VAULT_SEED, task.as_ref()], &proofmarket::ID).1
    );

    // The vault is a token account of the bounty mint owned by the task PDA.
    let vault =
        spl_token::state::Account::unpack(&env.svm.get_account(&vault_pda(&task)).unwrap().data)
            .unwrap();
    assert_eq!((vault.mint, vault.owner), (env.mint, task));

    let ev: TaskInitialized = find_event(&logs).expect("TaskInitialized emitted");
    assert_eq!(
        (ev.task, ev.task_id_hash, ev.amount_total, ev.deadline),
        (task, args.task_id_hash, total, NOW + DAY)
    );
}

#[test]
fn p_init_02_same_hash_twice_fails() {
    let mut env = Env::new();
    let task = env.fund(task_args(2));

    // Same task_id_hash again (other amounts, so it is not a byte-identical transaction).
    let mut again = task_args(2);
    again.amount_per_witness = 5 * AMOUNT;
    let ix = env.ix_initialize_task(again);
    assert_custom_err(env.as_operator(ix), SYSTEM_ACCOUNT_ALREADY_IN_USE);

    assert_eq!(env.token_balance(&vault_pda(&task)), 3 * AMOUNT);
    assert_eq!(
        env.token_balance(&env.treasury),
        TREASURY_START - 3 * AMOUNT
    );
    assert_eq!(env.task(&task).amount_per_witness, AMOUNT);
}

#[test]
fn p_init_03_invalid_args_fail() {
    let mut env = Env::new();
    let mut seed = 10u8;
    let mut next = || {
        seed += 1;
        task_args(seed)
    };

    // Mint other than config.bounty_mint.
    let other_mint = env.new_mint();
    let ix =
        env.ix_initialize_task_with(&env.operator.pubkey(), &other_mint, &env.treasury, next());
    assert_err(env.as_operator(ix), ProofMarketError::InvalidMint);

    // Treasury other than config.treasury (same mint and owner, different account).
    let other_treasury = Pubkey::new_unique();
    let (mint, op) = (env.mint, env.operator.pubkey());
    env.put_token_account(other_treasury, &mint, &op, TREASURY_START);
    let ix = env.ix_initialize_task_with(&op, &mint, &other_treasury, next());
    assert_err(env.as_operator(ix), ProofMarketError::InvalidTreasury);

    // Zero amount.
    let mut a = next();
    a.amount_per_witness = 0;
    let ix = env.ix_initialize_task(a);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidAmount);

    // N = 0, Q = 0, Q > N, N > max_witnesses.
    for (n, q) in [
        (0u8, 0u8),
        (0, 1),
        (3, 0),
        (2, 3),
        (MAX_RECIPIENTS as u8 + 1, 1),
    ] {
        let mut a = next();
        a.required_witnesses = n;
        a.quorum = q;
        let ix = env.ix_initialize_task(a);
        assert_err(env.as_operator(ix), ProofMarketError::InvalidWitnessConfig);
    }

    // Deadline not in the future.
    for deadline in [NOW, NOW - 1, 0] {
        let mut a = next();
        a.deadline = deadline;
        let ix = env.ix_initialize_task(a);
        assert_err(env.as_operator(ix), ProofMarketError::DeadlineInPast);
    }

    // Signer other than config.operator (the verifier and a stranger), even with funds of their own.
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), 10 * SOL).unwrap();
    for signer in [env.verifier.insecure_clone(), stranger] {
        let ix = env.ix_initialize_task_with(&signer.pubkey(), &env.mint, &env.treasury, next());
        assert_err(env.send(&[ix], &signer), ProofMarketError::Unauthorized);
    }

    // Paused: rejected; unpaused again: accepted.
    let ix = env.ix_update_config(
        &env.admin.pubkey(),
        UpdateConfigArgs {
            paused: Some(true),
            ..no_config_change()
        },
    );
    assert_ok(env.as_admin(ix));
    let paused_args = next();
    let ix = env.ix_initialize_task(paused_args.clone());
    assert_err(env.as_operator(ix), ProofMarketError::Paused);

    // Nothing above moved any token or created any task.
    assert_eq!(env.token_balance(&env.treasury), TREASURY_START);
    for s in 11..=seed {
        assert!(
            env.svm.get_account(&task_pda(&hash(s))).is_none(),
            "task {s} must not exist"
        );
    }

    let ix = env.ix_update_config(
        &env.admin.pubkey(),
        UpdateConfigArgs {
            paused: Some(false),
            ..no_config_change()
        },
    );
    assert_ok(env.as_admin(ix));
    env.fund(paused_args);
}

// ---------------------------------------------------------------------------------------------
// finalize_verification (06 §3.3)
// ---------------------------------------------------------------------------------------------

#[test]
fn p_fin_01_finalizes() {
    let mut env = Env::new();

    // Verified: recipients >= quorum.
    let task = env.fund(task_args(20));
    let (wallets, _) = env.new_recipients(2);
    let ix = env.ix_finalize(&task, finalize_args(Outcome::Verified, wallets.clone()));
    let logs = assert_ok(env.as_verifier(ix));
    let t = env.task(&task);
    assert_eq!(t.status, TaskStatus::Finalized);
    assert_eq!(t.outcome, Outcome::Verified);
    assert_eq!(t.evidence_root, [0x11; 32]);
    assert_eq!(t.result_hash, [0x22; 32]);
    assert_eq!(t.recipient_count, 2);
    assert_eq!(&t.recipients[..2], wallets.as_slice());
    assert!(t.recipients[2..].iter().all(|r| *r == Pubkey::default()));
    assert_eq!(t.finalized_at, NOW);
    // finalize moves no tokens.
    assert_eq!(env.token_balance(&vault_pda(&task)), 3 * AMOUNT);
    let ev: VerificationFinalized = find_event(&logs).expect("VerificationFinalized emitted");
    assert_eq!(ev.task, task);
    assert_eq!(ev.outcome, Outcome::Verified);
    assert_eq!(
        (ev.evidence_root, ev.result_hash, ev.recipient_count),
        ([0x11; 32], [0x22; 32], 2)
    );

    // NoConsensus: all N recipients.
    let task = env.fund(task_args(21));
    let (wallets, _) = env.new_recipients(3);
    env.finalize(&task, Outcome::NoConsensus, &wallets);
    assert_eq!(env.task(&task).outcome, Outcome::NoConsensus);
    assert_eq!(env.task(&task).recipient_count, 3);

    // InsufficientWitnesses: 1 <= recipients < quorum.
    let task = env.fund(task_args(22));
    let (wallets, _) = env.new_recipients(1);
    env.finalize(&task, Outcome::InsufficientWitnesses, &wallets);
    assert_eq!(env.task(&task).outcome, Outcome::InsufficientWitnesses);
    assert_eq!(env.task(&task).status, TaskStatus::Finalized);
}

#[test]
fn p_fin_02_invalid_finalize_fails() {
    let mut env = Env::new();
    let task = env.fund(task_args(30)); // N = 3, Q = 2
    let (w, _) = env.new_recipients(4);

    // Signer other than config.verifier (the operator and a stranger).
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), 10 * SOL).unwrap();
    for signer in [env.operator.insecure_clone(), stranger] {
        let ix = env.ix_finalize_with(
            &signer.pubkey(),
            &task,
            finalize_args(Outcome::Verified, w[..2].to_vec()),
        );
        assert_err(env.send(&[ix], &signer), ProofMarketError::Unauthorized);
    }

    // All-zero roots.
    let mut args = finalize_args(Outcome::Verified, w[..2].to_vec());
    args.evidence_root = [0; 32];
    let ix = env.ix_finalize(&task, args);
    assert_err(env.as_verifier(ix), ProofMarketError::InvalidRoot);
    let mut args = finalize_args(Outcome::Verified, w[..2].to_vec());
    args.result_hash = [0; 32];
    let ix = env.ix_finalize(&task, args);
    assert_err(env.as_verifier(ix), ProofMarketError::InvalidRoot);

    let bad_recipients: Vec<(Outcome, Vec<Pubkey>)> = vec![
        (Outcome::Verified, vec![w[0], w[0]]),              // duplicate
        (Outcome::Verified, vec![w[0], w[1], w[0]]),        // duplicate, not adjacent
        (Outcome::Verified, vec![w[0], Pubkey::default()]), // default key
        (Outcome::NoConsensus, w[..4].to_vec()),            // more than required_witnesses
        (Outcome::Verified, vec![w[0]]),                    // fewer than quorum
        (Outcome::NoConsensus, vec![]),                     // fewer than quorum
        (Outcome::InsufficientWitnesses, vec![]),           // must be >= 1
        (Outcome::InsufficientWitnesses, w[..2].to_vec()),  // must be < quorum
        (Outcome::None, w[..2].to_vec()),                   // None is never a result
    ];
    for (outcome, recipients) in bad_recipients {
        let ix = env.ix_finalize(&task, finalize_args(outcome, recipients.clone()));
        let res = env.as_verifier(ix);
        assert!(res.is_err(), "{outcome:?} {recipients:?} must fail");
        assert_err(res, ProofMarketError::InvalidRecipients);
    }
    // Still Funded after all the rejected attempts.
    assert_eq!(env.task(&task).status, TaskStatus::Funded);

    // Not Funded: already Finalized.
    env.finalize(&task, Outcome::Verified, &w[..2]);
    let ix = env.ix_finalize(&task, finalize_args(Outcome::Verified, w[1..3].to_vec()));
    assert_err(env.as_verifier(ix), ProofMarketError::InvalidStatus);
    assert_eq!(&env.task(&task).recipients[..2], &w[..2]);

    // Not Funded: Refunded.
    let refunded = env.fund(task_args(31));
    let ix = env.ix_refund(&refunded, RefundReason::Cancelled);
    assert_ok(env.as_operator(ix));
    let ix = env.ix_finalize(&refunded, finalize_args(Outcome::Verified, w[..2].to_vec()));
    assert_err(env.as_verifier(ix), ProofMarketError::InvalidStatus);
}

#[test]
fn p_fin_03_no_time_limit() {
    let mut env = Env::new();
    let task = env.fund(task_args(40));
    let (wallets, atas) = env.new_recipients(2);

    // Long after the deadline (an RPC outage of a month): finalize still works (D-11) ...
    let late = NOW + DAY + 30 * DAY;
    env.set_clock(late);
    env.finalize(&task, Outcome::Verified, &wallets);
    assert_eq!(env.task(&task).finalized_at, late);

    // ... and the workers still get paid.
    let ix = env.ix_settle(&task, &atas);
    assert_ok(env.as_operator(ix));
    assert_eq!(env.task(&task).status, TaskStatus::Settled);
    for ata in &atas {
        assert_eq!(env.token_balance(ata), AMOUNT);
    }
}

// ---------------------------------------------------------------------------------------------
// settle (06 §3.4)
// ---------------------------------------------------------------------------------------------

#[test]
fn p_set_01_settles() {
    let mut env = Env::new();

    // 2 of 3 paid: remainder (1 share) goes back to the treasury.
    let (task, atas) = env.finalized_task(50);
    let vault = vault_pda(&task);
    let vault_rent = env.svm.get_account(&vault).unwrap().lamports;
    let operator_before = env.svm.get_balance(&env.operator.pubkey()).unwrap();
    env.set_clock(NOW + 60);

    let ix = env.ix_settle(&task, &atas);
    let logs = assert_ok(env.as_operator(ix));

    for ata in &atas {
        assert_eq!(env.token_balance(ata), AMOUNT);
    }
    assert_eq!(
        env.token_balance(&env.treasury),
        TREASURY_START - 2 * AMOUNT
    );
    assert!(env.is_closed(&vault), "vault must be closed");
    // Vault rent returns to the operator (minus the 5000-lamport signature fee it paid).
    let operator_after = env.svm.get_balance(&env.operator.pubkey()).unwrap();
    assert_eq!(operator_after, operator_before + vault_rent - 5_000);

    let t = env.task(&task);
    assert_eq!(t.status, TaskStatus::Settled);
    assert_eq!(t.paid_total, 2 * AMOUNT);
    assert_eq!(t.closed_at, NOW + 60);
    assert_eq!(t.outcome, Outcome::Verified);

    let ev: TaskSettled = find_event(&logs).expect("TaskSettled emitted");
    assert_eq!(
        (ev.task, ev.paid_total, ev.remainder),
        (task, 2 * AMOUNT, AMOUNT)
    );

    // All N paid: remainder 0, no transfer to the treasury, vault still closed.
    let task = env.fund(task_args(51));
    let (wallets, atas) = env.new_recipients(3);
    env.finalize(&task, Outcome::Verified, &wallets);
    let treasury_before = env.token_balance(&env.treasury);
    let ix = env.ix_settle(&task, &atas);
    let logs = assert_ok(env.as_operator(ix));
    assert_eq!(env.token_balance(&env.treasury), treasury_before);
    assert!(env.is_closed(&vault_pda(&task)));
    let ev: TaskSettled = find_event(&logs).unwrap();
    assert_eq!((ev.paid_total, ev.remainder), (3 * AMOUNT, 0));

    // InsufficientWitnesses (1 recipient): pays the one valid witness, returns the rest.
    let task = env.fund(task_args(52));
    let (wallets, atas) = env.new_recipients(1);
    env.finalize(&task, Outcome::InsufficientWitnesses, &wallets);
    let treasury_before = env.token_balance(&env.treasury);
    let ix = env.ix_settle(&task, &atas);
    assert_ok(env.as_operator(ix));
    assert_eq!(env.token_balance(&atas[0]), AMOUNT);
    assert_eq!(
        env.token_balance(&env.treasury),
        treasury_before + 2 * AMOUNT
    );
}

#[test]
fn p_set_02_settle_twice_fails() {
    let mut env = Env::new();
    let (task, atas) = env.finalized_task(60);
    let ix = env.ix_settle(&task, &atas);
    assert_ok(env.as_operator(ix));

    // D8: the second settle fails with InvalidStatus even though the vault no longer exists.
    let ix = env.ix_settle(&task, &atas);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);
    for ata in &atas {
        assert_eq!(env.token_balance(ata), AMOUNT);
    }
    assert_eq!(env.task(&task).paid_total, 2 * AMOUNT);
}

#[test]
fn p_set_03_wrong_recipient_accounts_fail() {
    let mut env = Env::new();
    let task = env.fund(task_args(70));
    let (wallets, atas) = env.new_recipients(2);
    env.finalize(&task, Outcome::Verified, &wallets);

    // Too few / too many accounts.
    let ix = env.ix_settle(&task, &atas[..1]);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientCountMismatch,
    );
    let extra = vec![atas[0], atas[1], atas[0]];
    let ix = env.ix_settle(&task, &extra);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientCountMismatch,
    );

    // Wrong order.
    let ix = env.ix_settle(&task, &[atas[1], atas[0]]);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientAccountMismatch,
    );

    // ATA of a different mint (address differs from the expected ATA).
    let other_mint = env.new_mint();
    let other_mint_ata = env.new_ata(&wallets[0], &other_mint, 0);
    let ix = env.ix_settle(&task, &[other_mint_ata, atas[1]]);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientAccountMismatch,
    );

    // A token account of the right mint but owned by someone else (not the recipient's ATA).
    let stranger_ata = env.new_ata(&Pubkey::new_unique(), &env.mint.clone(), 0);
    let ix = env.ix_settle(&task, &[stranger_ata, atas[1]]);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientAccountMismatch,
    );

    // The expected ATA address, but its contents say another owner / another mint.
    let mint = env.mint;
    env.put_token_account(atas[0], &mint, &Pubkey::new_unique(), 0);
    let ix = env.ix_settle(&task, &atas);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientAccountMismatch,
    );
    env.put_token_account(atas[0], &other_mint, &wallets[0], 0);
    let ix = env.ix_settle(&task, &atas);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientAccountMismatch,
    );

    // The expected ATA address, but not a token-program account.
    env.svm
        .set_account(
            atas[0],
            SolanaAccount {
                lamports: SOL,
                data: vec![],
                owner: anchor_lang::system_program::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let ix = env.ix_settle(&task, &atas);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientAccountMismatch,
    );

    // Correct ATAs but passed read-only.
    env.put_token_account(atas[0], &mint, &wallets[0], 0);
    let metas = atas
        .iter()
        .map(|a| AccountMeta::new_readonly(*a, false))
        .collect();
    let ix = env.ix_settle_metas(&task, metas);
    assert_err(
        env.as_operator(ix),
        ProofMarketError::RecipientAccountMismatch,
    );

    // Nothing moved; with the correct accounts it settles.
    assert_eq!(env.task(&task).status, TaskStatus::Finalized);
    assert_eq!(env.token_balance(&vault_pda(&task)), 3 * AMOUNT);
    let ix = env.ix_settle(&task, &atas);
    assert_ok(env.as_operator(ix));
    assert_eq!(env.token_balance(&atas[0]), AMOUNT);
    assert_eq!(env.token_balance(&atas[1]), AMOUNT);
}

#[test]
fn p_set_04_settle_after_refund_fails() {
    let mut env = Env::new();
    let task = env.fund(task_args(80));
    let ix = env.ix_refund(&task, RefundReason::Cancelled);
    assert_ok(env.as_operator(ix));

    // D10: Refunded -> settle is InvalidStatus (with or without recipient accounts).
    let ix = env.ix_settle(&task, &[]);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);
    let (_, atas) = env.new_recipients(2);
    let ix = env.ix_settle(&task, &atas);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);
    assert_eq!(env.task(&task).status, TaskStatus::Refunded);
    assert_eq!(env.token_balance(&env.treasury), TREASURY_START);

    // A Funded (not yet finalized) task cannot be settled either.
    let funded = env.fund(task_args(81));
    let ix = env.ix_settle(&funded, &[]);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);
}

#[test]
fn p_set_05_settles_lowered_amount() {
    // v1.1 (13 §1): a rising bounty funds max per witness and finalizes the settled amount.
    let mut env = Env::new();
    let task = env.fund(task_args(82));
    let (wallets, atas) = env.new_recipients(2);
    let settled = AMOUNT * 6 / 10;
    let mut args = finalize_args(Outcome::Verified, wallets);
    args.amount_per_witness = Some(settled);
    let ix = env.ix_finalize(&task, args);
    assert_ok(env.as_verifier(ix));
    assert_eq!(env.task(&task).amount_per_witness, settled);

    let ix = env.ix_settle(&task, &atas);
    let logs = assert_ok(env.as_operator(ix));
    for ata in &atas {
        assert_eq!(env.token_balance(ata), settled);
    }
    // Funded 3 * AMOUNT; paid 2 * settled; everything else is back in the treasury.
    assert_eq!(
        env.token_balance(&env.treasury),
        TREASURY_START - 2 * settled
    );
    let ev: TaskSettled = find_event(&logs).unwrap();
    assert_eq!(
        (ev.paid_total, ev.remainder),
        (2 * settled, 3 * AMOUNT - 2 * settled)
    );
    assert_eq!(env.task(&task).paid_total, 2 * settled);
}

#[test]
fn p_fin_04_amount_cannot_rise_or_be_zero() {
    let mut env = Env::new();
    let task = env.fund(task_args(83));
    let (wallets, _) = env.new_recipients(2);

    let mut args = finalize_args(Outcome::Verified, wallets.clone());
    args.amount_per_witness = Some(AMOUNT + 1);
    let ix = env.ix_finalize(&task, args);
    assert_err(env.as_verifier(ix), ProofMarketError::AmountIncrease);

    let mut args = finalize_args(Outcome::Verified, wallets.clone());
    args.amount_per_witness = Some(0);
    let ix = env.ix_finalize(&task, args);
    assert_err(env.as_verifier(ix), ProofMarketError::InvalidAmount);

    let t = env.task(&task);
    assert_eq!((t.status, t.amount_per_witness), (TaskStatus::Funded, AMOUNT));

    // The same amount is allowed (no change).
    let mut args = finalize_args(Outcome::Verified, wallets);
    args.amount_per_witness = Some(AMOUNT);
    let ix = env.ix_finalize(&task, args);
    assert_ok(env.as_verifier(ix));
    assert_eq!(env.task(&task).amount_per_witness, AMOUNT);
}

// ---------------------------------------------------------------------------------------------
// refund (06 §3.5)
// ---------------------------------------------------------------------------------------------

#[test]
fn p_ref_01_cancel_refund() {
    let mut env = Env::new();
    let task = env.fund(task_args(90));
    let vault = vault_pda(&task);
    assert_eq!(
        env.token_balance(&env.treasury),
        TREASURY_START - 3 * AMOUNT
    );

    // reason None is not a refund reason.
    let ix = env.ix_refund(&task, RefundReason::None);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);

    // Only the operator may refund.
    let verifier = env.verifier.insecure_clone();
    let mut ix = env.ix_refund(&task, RefundReason::Cancelled);
    ix.accounts[0].pubkey = verifier.pubkey();
    assert_err(env.send(&[ix], &verifier), ProofMarketError::Unauthorized);

    env.set_clock(NOW + 10);
    let ix = env.ix_refund(&task, RefundReason::Cancelled);
    let logs = assert_ok(env.as_operator(ix));

    assert_eq!(env.token_balance(&env.treasury), TREASURY_START);
    assert!(env.is_closed(&vault), "vault must be closed");
    let t = env.task(&task);
    assert_eq!(t.status, TaskStatus::Refunded);
    assert_eq!(t.refund_reason, RefundReason::Cancelled);
    assert_eq!(t.closed_at, NOW + 10);
    assert_eq!(t.paid_total, 0);

    let ev: TaskRefunded = find_event(&logs).expect("TaskRefunded emitted");
    assert_eq!((ev.task, ev.amount), (task, 3 * AMOUNT));
    assert_eq!(ev.reason, RefundReason::Cancelled);

    // Refunded twice: InvalidStatus.
    let ix = env.ix_refund(&task, RefundReason::Cancelled);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);

    // Refunds work while paused (paused only blocks initialize_task).
    let task2 = env.fund(task_args(91));
    let ix = env.ix_update_config(
        &env.admin.pubkey(),
        UpdateConfigArgs {
            paused: Some(true),
            ..no_config_change()
        },
    );
    assert_ok(env.as_admin(ix));
    let ix = env.ix_refund(&task2, RefundReason::Cancelled);
    assert_ok(env.as_operator(ix));
    assert_eq!(env.token_balance(&env.treasury), TREASURY_START);
}

#[test]
fn p_ref_02_expired_before_deadline_fails() {
    let mut env = Env::new();
    let task = env.fund(task_args(100));
    let deadline = NOW + DAY;

    for now in [NOW, deadline - 1, deadline] {
        env.set_clock(now);
        let ix = env.ix_refund(&task, RefundReason::Expired);
        assert_err(env.as_operator(ix), ProofMarketError::NotExpired);
    }
    assert_eq!(env.task(&task).status, TaskStatus::Funded);
    assert_eq!(env.token_balance(&vault_pda(&task)), 3 * AMOUNT);

    // Strictly after the deadline it succeeds.
    env.set_clock(deadline + 1);
    let ix = env.ix_refund(&task, RefundReason::Expired);
    let logs = assert_ok(env.as_operator(ix));
    let t = env.task(&task);
    assert_eq!(
        (t.status, t.refund_reason),
        (TaskStatus::Refunded, RefundReason::Expired)
    );
    assert_eq!(env.token_balance(&env.treasury), TREASURY_START);
    let ev: TaskRefunded = find_event(&logs).unwrap();
    assert_eq!(ev.reason, RefundReason::Expired);
}

#[test]
fn p_ref_03_refund_after_finalize_or_settle_fails() {
    let mut env = Env::new();
    let (task, atas) = env.finalized_task(110);

    // Finalized: neither Cancelled nor Expired (even past the deadline).
    let ix = env.ix_refund(&task, RefundReason::Cancelled);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);
    env.set_clock(NOW + 2 * DAY);
    let ix = env.ix_refund(&task, RefundReason::Expired);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);
    assert_eq!(env.token_balance(&vault_pda(&task)), 3 * AMOUNT);

    // D9: Settled (vault closed) -> refund is InvalidStatus.
    let ix = env.ix_settle(&task, &atas);
    assert_ok(env.as_operator(ix));
    let treasury_after_settle = env.token_balance(&env.treasury);
    for reason in [RefundReason::Cancelled, RefundReason::Expired] {
        let ix = env.ix_refund(&task, reason);
        assert_err(env.as_operator(ix), ProofMarketError::InvalidStatus);
    }
    assert_eq!(env.task(&task).status, TaskStatus::Settled);
    assert_eq!(env.token_balance(&env.treasury), treasury_after_settle);
}

// ---------------------------------------------------------------------------------------------
// overflow and config
// ---------------------------------------------------------------------------------------------

#[test]
fn p_ovf_01_overflow_fails() {
    let mut env = Env::new();
    for (amount, n) in [
        (u64::MAX, 2u8),
        (u64::MAX / 5 + 1, 5),
        (u64::MAX / 2 + 1, 2),
    ] {
        let mut a = task_args(120 + n);
        a.amount_per_witness = amount;
        a.required_witnesses = n;
        a.quorum = 1;
        let ix = env.ix_initialize_task(a);
        assert_err(env.as_operator(ix), ProofMarketError::AmountOverflow);
    }
    assert_eq!(env.token_balance(&env.treasury), TREASURY_START);

    // The largest non-overflowing total is accepted by the program (the token transfer then
    // fails on the treasury balance, not on arithmetic).
    let mut a = task_args(130);
    a.amount_per_witness = u64::MAX / 5;
    a.required_witnesses = 5;
    let ix = env.ix_initialize_task(a);
    let res = env.as_operator(ix);
    let failed = res.expect_err("treasury cannot cover u64::MAX / 5 * 5");
    assert!(
        !matches!(
            failed.err,
            TransactionError::InstructionError(_, InstructionError::Custom(c)) if c == code(ProofMarketError::AmountOverflow)
        ),
        "must not be AmountOverflow: {:?}",
        failed.err
    );
}

#[test]
fn p_cfg_01_max_witnesses_capped() {
    let mut env = Env::new();
    let admin = env.admin.pubkey();

    for max in [MAX_RECIPIENTS as u8 + 1, 6, u8::MAX, 0] {
        let ix = env.ix_update_config(
            &admin,
            UpdateConfigArgs {
                max_witnesses: Some(max),
                ..no_config_change()
            },
        );
        assert_err(env.as_admin(ix), ProofMarketError::InvalidWitnessConfig);
    }
    let ix = env.ix_update_config(
        &admin,
        UpdateConfigArgs {
            max_witnesses: Some(3),
            ..no_config_change()
        },
    );
    assert_ok(env.as_admin(ix));

    // The new cap is enforced by initialize_task.
    let mut a = task_args(140);
    a.required_witnesses = 4;
    let ix = env.ix_initialize_task(a);
    assert_err(env.as_operator(ix), ProofMarketError::InvalidWitnessConfig);
    let ix = env.ix_update_config(
        &admin,
        UpdateConfigArgs {
            max_witnesses: Some(MAX_RECIPIENTS as u8),
            ..no_config_change()
        },
    );
    assert_ok(env.as_admin(ix));

    // operator == verifier is rejected (both via a new verifier and via a new operator).
    let op = env.operator.pubkey();
    let ix = env.ix_update_config(
        &admin,
        UpdateConfigArgs {
            verifier: Some(op),
            ..no_config_change()
        },
    );
    assert_err(env.as_admin(ix), ProofMarketError::Unauthorized);
    let ver = env.verifier.pubkey();
    let ix = env.ix_update_config(
        &admin,
        UpdateConfigArgs {
            operator: Some(ver),
            ..no_config_change()
        },
    );
    assert_err(env.as_admin(ix), ProofMarketError::Unauthorized);

    // bounty_mint and treasury must change together.
    let new_mint = Pubkey::new_unique();
    let new_treasury = Pubkey::new_unique();
    let ix = env.ix_update_config(
        &admin,
        UpdateConfigArgs {
            bounty_mint: Some(new_mint),
            ..no_config_change()
        },
    );
    assert_err(env.as_admin(ix), ProofMarketError::InvalidTreasury);
    let ix = env.ix_update_config(
        &admin,
        UpdateConfigArgs {
            treasury: Some(new_treasury),
            ..no_config_change()
        },
    );
    assert_err(env.as_admin(ix), ProofMarketError::InvalidTreasury);

    // Only the admin may update.
    let operator = env.operator.insecure_clone();
    let ix = env.ix_update_config(
        &operator.pubkey(),
        UpdateConfigArgs {
            paused: Some(true),
            ..no_config_change()
        },
    );
    assert_err(env.send(&[ix], &operator), ProofMarketError::Unauthorized);

    // A valid rotation of everything.
    let (new_op, new_ver) = (Pubkey::new_unique(), Pubkey::new_unique());
    let ix = env.ix_update_config(
        &admin,
        UpdateConfigArgs {
            operator: Some(new_op),
            verifier: Some(new_ver),
            paused: Some(true),
            max_witnesses: Some(4),
            bounty_mint: Some(new_mint),
            treasury: Some(new_treasury),
        },
    );
    assert_ok(env.as_admin(ix));
    let account = env.svm.get_account(&config_pda()).unwrap();
    let config = proofmarket::Config::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!((config.operator, config.verifier), (new_op, new_ver));
    assert_eq!(
        (config.bounty_mint, config.treasury),
        (new_mint, new_treasury)
    );
    assert_eq!((config.max_witnesses, config.paused), (4, true));
    assert_eq!(config.admin, admin);
}

#[test]
fn initialize_config_validates_args() {
    // Fresh SVM without a config: exercise initialize_config's own checks.
    let mut env = Env::new();
    env.svm
        .set_account(
            config_pda(),
            SolanaAccount {
                lamports: 0,
                data: vec![],
                owner: anchor_lang::system_program::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let (op, ver) = (env.operator.pubkey(), env.verifier.pubkey());

    for max in [0u8, MAX_RECIPIENTS as u8 + 1] {
        let ix = env.ix_initialize_config(InitializeConfigArgs {
            operator: op,
            verifier: ver,
            max_witnesses: max,
        });
        assert_err(env.as_admin(ix), ProofMarketError::InvalidWitnessConfig);
    }
    let ix = env.ix_initialize_config(InitializeConfigArgs {
        operator: op,
        verifier: op,
        max_witnesses: 5,
    });
    assert_err(env.as_admin(ix), ProofMarketError::Unauthorized);

    let ix = env.ix_initialize_config(InitializeConfigArgs {
        operator: op,
        verifier: ver,
        max_witnesses: 5,
    });
    assert_ok(env.as_admin(ix));
    let account = env.svm.get_account(&config_pda()).unwrap();
    let config = proofmarket::Config::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(config.admin, env.admin.pubkey());
    assert_eq!((config.operator, config.verifier), (op, ver));
    assert_eq!(
        (config.bounty_mint, config.treasury),
        (env.mint, env.treasury)
    );
    assert_eq!((config.max_witnesses, config.paused), (5, false));
    assert_eq!(
        config.bump,
        Pubkey::find_program_address(&[CONFIG_SEED], &proofmarket::ID).1
    );

    // A second initialize_config cannot take over the existing config.
    let ix = env.ix_initialize_config(InitializeConfigArgs {
        operator: op,
        verifier: ver,
        max_witnesses: 4,
    });
    assert_custom_err(env.as_admin(ix), SYSTEM_ACCOUNT_ALREADY_IN_USE);
}
