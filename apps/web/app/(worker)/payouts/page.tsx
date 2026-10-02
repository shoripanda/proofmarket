// W-08 支払い履歴 — 02-system-architecture.md §5. Implementation: PR-12.
// Never show the words Solana / wallet / SOL to workers (REQ-X-W-104).

export default function PayoutsPage() {
  return (
    <main>
      <h1>支払い履歴</h1>
      <p>金額、日時、状態、「取引記録を見る」。</p>
      <ul>
        <li>
          <code>{"GET /v1/worker/payouts"}</code>
        </li>
      </ul>
      <p>実装予定: PR-12</p>
    </main>
  );
}
