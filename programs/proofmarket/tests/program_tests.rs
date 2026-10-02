//! LiteSVM tests for 09-test-plan.md §3.2. Bodies are written in PR-09 together with the handlers.
//! Build the program first (`anchor build`); tests load target/deploy/proofmarket.so.

macro_rules! pending {
    ($($name:ident => $desc:literal),* $(,)?) => {
        $(
            #[test]
            #[ignore = $desc]
            fn $name() {
                unimplemented!($desc);
            }
        )*
    };
}

pending! {
    p_init_01_funds_vault => "P-INIT-01: vault balance == amount * N after initialize_task",
    p_init_02_same_hash_twice_fails => "P-INIT-02: second initialize_task with the same task_id_hash fails",
    p_init_03_invalid_args_fail => "P-INIT-03: wrong mint / zero amount / N=0 / Q>N / past deadline / paused / non-operator fail",
    p_fin_01_finalizes => "P-FIN-01: finalize_verification succeeds from Funded",
    p_fin_02_invalid_finalize_fails => "P-FIN-02: non-verifier / not Funded / bad recipients / zero root fail",
    p_fin_03_no_time_limit => "P-FIN-03: Funded task can be finalized long after deadline (D-11)",
    p_set_01_settles => "P-SET-01: pays recipients, remainder to treasury, vault closed",
    p_set_02_settle_twice_fails => "P-SET-02: second settle fails with InvalidStatus (D8)",
    p_set_03_wrong_recipient_accounts_fail => "P-SET-03: wrong order / wrong mint / wrong owner ATA fails",
    p_set_04_settle_after_refund_fails => "P-SET-04: settle after refund fails (D10)",
    p_ref_01_cancel_refund => "P-REF-01: refund(Cancelled) from Funded succeeds",
    p_ref_02_expired_before_deadline_fails => "P-REF-02: refund(Expired) before deadline fails with NotExpired",
    p_ref_03_refund_after_finalize_or_settle_fails => "P-REF-03: refund after Finalized / Settled fails (D9)",
    p_ovf_01_overflow_fails => "P-OVF-01: amount * N overflow fails with AmountOverflow",
    p_cfg_01_max_witnesses_capped => "P-CFG-01: update_config with max_witnesses > 5 fails",
}
