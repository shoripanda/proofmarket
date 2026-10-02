// W-06 撮影と回答 — 02-system-architecture.md §5. Implementation: PR-06.
// Never show the words Solana / wallet / SOL to workers (REQ-X-W-104).

export default function ClaimsIdCapturePage() {
  return (
    <main>
      <h1>撮影と回答</h1>
      <p>
        challenge 取得 → getUserMedia のライブ映像 → 撮影（canvas→JPEG）→ 位置取得 → 回答選択 → アップロード →
        提出。ギャラリー選択の導線は作らない。
      </p>
      <ul>
        <li>
          <code>{"POST /v1/worker/claims/{claim_id}/challenge"}</code>
        </li>
        <li>
          <code>{"POST /v1/worker/claims/{claim_id}/uploads"}</code>
        </li>
        <li>
          <code>{"POST /v1/worker/tasks/{id}/evidence"}</code>
        </li>
      </ul>
      <p>実装予定: PR-06</p>
    </main>
  );
}
