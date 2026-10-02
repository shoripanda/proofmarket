// pnpm tsx scripts/issue-api-key.ts --principal "<name>" --type organization --max-task 5 --daily 20 [--topup 10]
// Creates principal (if new) + requester_credentials; prints pm_test_<prefix>_<secret> ONCE (only SHA-256 stored).
// --topup writes a TOPUP ledger entry. Every issuance is written to audit_events (04 §5). Implementation: PR-04.
throw new Error("NOT_IMPLEMENTED: issue-api-key (PR-04)");
