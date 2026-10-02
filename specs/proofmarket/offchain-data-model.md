# Off-chain Data Model

更新日: 2026-10-02

Names are semantic; implementation may map them to SQL tables/documents differently.

## 1. Principal

Fields:
- principal_id
- type: person | organization
- display_name
- verification_status
- country/jurisdiction
- created_at
- status

Sensitive contact details stored separately if needed.

## 2. RequesterCredential

Fields:
- credential_id
- principal_id
- requester_name
- secret_hash / token reference
- allowed_task_types
- max_task_amount
- daily_spend_limit
- rate_limit
- allowed_geography optional
- created_at
- revoked_at

Never store plaintext API secret after creation if avoidable.

## 3. VerificationRequest

Fields:
- verification_id
- requester/principal ref
- type
- question
- answer_schema
- target_location encrypted/restricted
- geofence_radius
- deadline
- freshness_rule
- evidence_requirements
- required_witnesses
- quorum
- bounty terms
- status
- idempotency_key_hash
- created_at/updated_at

## 4. WorkerProfile

Fields:
- worker_id
- authentication refs
- eligibility/verification flags
- capability flags
- coarse service area
- status
- reputation summary
- created_at

Do not expose precise persistent worker location.

## 5. Claim

Fields:
- claim_id
- verification_id
- worker_id
- accepted_at
- expires_at
- nonce_hash
- state
- submitted_at

One worker must not create multiple votes on the same task unless explicitly allowed for retries that do not count as additional witnesses.

## 6. EvidenceObject

Fields:
- evidence_id
- claim_id
- object_storage_key
- media_type
- byte_size
- sha256
- perceptual_hash optional
- server_received_at
- client_capture_at
- raw metadata restricted
- retention_class

Public API should use signed/temporary references, not storage key.

## 7. LocationObservation

Fields:
- claim_id
- lat/lng encrypted or restricted
- accuracy_m
- client_timestamp
- server_received_at
- geofence_pass
- distance_to_target_m
- spoof/risk flags if available

Precise coordinates are sensitive and should not be returned to requester unless absolutely necessary.

## 8. EvidenceCheck

Fields:
- check_id
- claim_id
- check_type
- status: pass | fail | warning | not_run
- reason_code
- machine_details
- created_at

Check types:
- geofence
- freshness
- nonce
- replay
- duplicate
- media_schema
- vision_consistency

## 9. WitnessSubmission

Fields:
- submission_id
- verification_id
- claim_id
- worker_id
- answer
- evidence refs
- validation_state
- accepted_for_consensus
- submitted_at

## 10. VerificationResult

Fields:
- verification_id
- final_status
- final_answer
- valid_witness_count
- quorum
- consensus_ratio
- accepted submission hashes
- evidence_root
- result_hash
- finalized_at
- onchain reference
- settlement status

## 11. PaymentRecord

Fields:
- payment_id
- verification_id
- direction/type
- asset
- amount
- network
- chain signature/reference
- status
- attempt count
- created_at/confirmed_at

Never infer settlement only from internal status; chain confirmation/reference should be recorded where applicable.

## 12. AuditEvent

Append-only logical event:
- audit_id
- verification_id
- actor_type
- actor_ref
- event_type
- before_state
- after_state
- timestamp
- correlation_id
- metadata redacted/minimized

## 13. Retention classes

At minimum define:
- account/audit
- task metadata
- raw evidence
- precise location
- payment record

Raw evidence and precise location should have shorter default retention than accounting/security logs unless user/legal requirements demand otherwise.
