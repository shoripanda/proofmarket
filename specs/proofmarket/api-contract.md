# API / MCP Contract

更新日: 2026-10-02

This document defines external behavior, not implementation framework.

## Versioning

Base REST prefix:

`/v1`

Breaking changes require a new major path or explicit version negotiation.

## Authentication

Requester endpoints require an API credential mapped to:

- requester account
- responsible principal
- spend limit
- task category allowlist
- geographic constraints if configured

Worker endpoints require authenticated worker session.

Never use a Solana private key as the general API authentication mechanism.

## 1. Create verification

`POST /v1/verifications`

Header:

`Idempotency-Key: <unique-string>`

Request:

```json
{
  "type": "PLACE_STATUS_VERIFICATION",
  "question": "Is this shop open right now?",
  "answer_schema": {
    "type": "enum",
    "values": ["OPEN", "CLOSED", "UNCLEAR"]
  },
  "location": {
    "lat": 35.0000,
    "lng": 135.0000,
    "radius_m": 80
  },
  "deadline": "2026-10-02T12:00:00Z",
  "freshness": {
    "max_age_seconds": 300
  },
  "evidence_requirements": {
    "photo": true,
    "task_nonce": true
  },
  "assurance": {
    "required_witnesses": 1,
    "quorum": 1
  },
  "bounty": {
    "asset": "USDC",
    "amount": "0.50",
    "network": "solana-devnet"
  },
  "principal_ref": "principal_..."
}
```

Response:

```json
{
  "verification_id": "ver_...",
  "status": "CREATED",
  "created_at": "...",
  "funding": {
    "status": "PENDING"
  }
}
```

## 2. Get verification

`GET /v1/verifications/{verification_id}`

Response includes current state, public-safe task fields, witness progress and final result when available.

## 3. Cancel verification

`POST /v1/verifications/{verification_id}/cancel`

Only valid from states defined in `requirements.md`.

## 4. Worker: list eligible tasks

`GET /v1/worker/tasks?lat=...&lng=...&radius_km=...`

Must not return sensitive requester data not necessary to perform task.

## 5. Worker: claim

`POST /v1/worker/tasks/{verification_id}/claim`

Response:

```json
{
  "claim_id": "clm_...",
  "status": "CLAIMED",
  "challenge": {
    "nonce": "random-one-time-value",
    "expires_at": "..."
  }
}
```

Nonce must be unpredictable and single-use.

## 6. Worker: submit evidence

`POST /v1/worker/tasks/{verification_id}/evidence`

Transport may be multipart or pre-signed upload; contract semantics must include:

```json
{
  "claim_id": "clm_...",
  "answer": "OPEN",
  "capture": {
    "client_timestamp": "...",
    "lat": 35.0000,
    "lng": 135.0000,
    "accuracy_m": 12
  },
  "challenge": {
    "nonce": "..."
  },
  "evidence": [
    {
      "type": "photo",
      "object_ref": "upload_..."
    }
  ]
}
```

Server must record authoritative receive time independently of client timestamp.

## 7. VerificationResult

```json
{
  "verification_id": "ver_...",
  "status": "VERIFIED",
  "answer": "OPEN",
  "witnesses": {
    "valid": 2,
    "required": 2,
    "quorum": 2
  },
  "consensus_ratio": 1.0,
  "checks": {
    "geofence": "pass",
    "freshness": "pass",
    "task_nonce": "pass",
    "replay": "pass",
    "media_schema": "pass",
    "vision_consistency": "not_run"
  },
  "evidence_root": "sha256:...",
  "attestation": {
    "network": "solana-devnet",
    "signature": "..."
  },
  "settlement": {
    "status": "SETTLED",
    "signature": "..."
  },
  "verified_at": "..."
}
```

## 8. Error format

All API errors:

```json
{
  "error": {
    "code": "EVIDENCE_OUTSIDE_GEOFENCE",
    "message": "Evidence location does not satisfy task geofence.",
    "retryable": false,
    "details": {}
  }
}
```

Do not return stack traces/secrets.

## 9. Idempotency

Required for:
- create verification
- fund
- evidence finalize
- settlement/refund

Same idempotency key + same request = same logical result.

Same key + materially different request = conflict error.

## 10. MCP tools

P1 MCP surface:

### `request_reality_verification`
Maps to create verification.

### `get_reality_verification`
Maps to get status/result.

### `cancel_reality_verification`
Maps to cancel.

MCP descriptions must state that actual human execution is asynchronous. Tool must never fabricate completion to satisfy an agent waiting synchronously.

## 11. Webhook / callback

P1:

Requester may provide a callback endpoint or subscribe to events.

Events:
- `verification.open`
- `verification.claimed`
- `verification.submitted`
- `verification.verified`
- `verification.rejected`
- `verification.settled`
- `verification.expired`

Webhook delivery must be signed and retry-safe.
