# Privacy, Security and Abuse Model

更新日: 2026-10-02

## 1. Security goals

Protect:
- worker safety
- requester funds
- evidence integrity
- task integrity
- private location/personal data
- API credentials
- signing keys
- settlement correctness

## 2. Threats

### Malicious requester
Could:
- create stalking/surveillance task
- send worker to unsafe/private location
- request illegal purchase/action
- hide dangerous instructions in free text
- spam low-value tasks
- deny valid work

Controls:
- category allowlist
- policy classifier/rules
- accountable principal
- spend/rate caps
- manual review path
- public-location restriction for MVP
- clear acceptance criteria

### Malicious worker
Could:
- upload old photo
- upload photo from another location
- replay same image
- spoof GPS
- create multiple identities
- collude with other witnesses

Controls:
- server receive time
- one-time nonce/challenge
- geofence + accuracy
- duplicate/perceptual hash
- worker/task uniqueness
- rate limits
- reputation/risk flags
- multi-witness where required

No single control should be described as “proof” of physical presence by itself.

### Malicious evidence
Uploaded file may contain:
- oversized payload
- malformed image
- embedded metadata
- malware/polyglot content
- prompt injection text visible in image

Controls:
- size/type allowlist
- safe decoding/re-encoding
- isolated processing
- metadata stripping for derived/public copy
- do not pass untrusted OCR/image text into privileged agent context without delimiters/policy

### API attacks
- stolen API key
- replay
- idempotency abuse
- webhook forgery
- SSRF through callback URL
- injection in task text

Controls:
- scoped/revocable credentials
- nonce/idempotency
- signed webhook
- callback allow/verification rules
- output encoding
- server-side policy independent of agent prompt

### Settlement attacks
- double settlement
- wrong recipient/mint
- replayed transaction
- refund after payout
- unbounded signer

Controls:
- state-machine invariants
- mint/recipient/amount validation
- spend caps
- constrained signer
- never expose production private key to client/browser
- settlement/refund mutual exclusivity

## 3. Privacy

### Data minimization
Collect only:
- location necessary to validate task
- evidence necessary for requested fact
- account data necessary for operations/compliance

### Worker location
Do not expose:
- home location
- movement history
- precise persistent location

Requester ordinarily receives only:
- geofence pass/fail
- evidence artifact if authorized
- final answer

### Bystanders
Workers should avoid intentionally capturing identifiable bystanders where not needed.

MVP task instructions should prefer storefront/signage/object framing rather than faces.

### On-chain privacy
Never put:
- raw location
- image
- email/phone/name
- EXIF
- free-text evidence
on a public chain.

## 4. Safety policy for MVP

Allowed examples:
- public storefront open/closed
- public posted price
- public signage
- product presence visible in ordinary retail context, without purchase

Disallowed:
- private-person location
- children/minors
- private residence verification
- entering restricted/private property
- covert recording
- harassment
- illegal/controlled goods
- weapons
- sex work
- medical/legal/financial judgment
- task requiring worker to impersonate another person
- task designed to defeat security/access controls
- dangerous weather/traffic/physical exposure

## 5. Human agency

Worker must:
- see scope before accepting
- be able to decline
- be able to stop
- not be penalized for refusing unsafe/illegal change in scope
- receive clear notice of required evidence and reward

Agent must not change material scope after claim without renewed worker consent.

## 6. Evidence integrity levels

Do not claim “verified reality” as absolute certainty.

Expose concrete assurance signals:
- witness count
- consensus
- geofence pass
- freshness pass
- nonce pass
- duplicate/replay pass
- media check
- optional model check

## 7. Key management

- secrets only in secure environment
- no seed phrase/private key in repo/log
- use disposable Devnet account for hackathon
- production signer requires transaction/spend limits
- rotate/revoke credentials
- segregate requester API credentials from blockchain signing credentials

## 8. Incident response minimum

Need ability to:
- suspend requester
- suspend worker
- freeze new tasks
- disable settlement path
- revoke API key
- identify affected verification IDs
- retain necessary audit trail
- remove public evidence access
