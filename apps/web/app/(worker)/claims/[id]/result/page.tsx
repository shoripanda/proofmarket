// W-07 判定結果 — 02-system-architecture.md §5. Implementation: PR-06.
// Never show the words Solana / wallet / SOL to workers (REQ-X-W-104).

export default function ClaimsIdResultPage() {
  return (
    <main>
      <h1>判定結果</h1>
      <p>合格/不合格、理由とやり直し方、残り試行回数。</p>
      <ul>
        <li>
          <code>{"GET /v1/worker/claims/{claim_id}"}</code>
        </li>
      </ul>
      <p>実装予定: PR-06</p>
    </main>
  );
}
