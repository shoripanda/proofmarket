// W-05 移動中 — 02-system-architecture.md §5. Implementation: PR-05.
// Never show the words Solana / wallet / SOL to workers (REQ-X-W-104).

export default function ClaimsIdPage() {
  return (
    <main>
      <h1>移動中</h1>
      <p>残り時間、「現地に着いた」、「やめる」。</p>
      <ul>
        <li>
          <code>{"GET /v1/worker/claims/{claim_id}"}</code>
        </li>
        <li>
          <code>{"POST /v1/worker/claims/{claim_id}/abandon"}</code>
        </li>
      </ul>
      <p>実装予定: PR-05</p>
    </main>
  );
}
