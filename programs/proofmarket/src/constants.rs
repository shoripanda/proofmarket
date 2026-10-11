use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const TASK_SEED: &[u8] = b"task";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
/// seeds = [MINT_SEED, mint]: a mint other than Config.bounty_mint that tasks may escrow (15 §3.1).
#[constant]
pub const MINT_SEED: &[u8] = b"mint";

/// Fixed size of Task.recipients. Config.max_witnesses can never exceed this (P-CFG-01).
pub const MAX_RECIPIENTS: usize = 5;

/// Task account layout version.
pub const TASK_VERSION: u8 = 1;
