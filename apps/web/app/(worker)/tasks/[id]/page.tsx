// W-04 タスク詳細 — 02-system-architecture.md §5. Implementation: PR-05.
// Never show the words Solana / wallet / SOL to workers (REQ-X-W-104).

export default function TasksIdPage() {
  return (
    <main>
      <h1>タスク詳細</h1>
      <p>質問、店舗位置（地図アプリへのリンク）、半径、報酬、締切、撮影の注意、「引き受ける」。</p>
      <ul>
        <li>
          <code>{"GET /v1/worker/tasks/{id}"}</code>
        </li>
        <li>
          <code>{"POST /v1/worker/tasks/{id}/claim"}</code>
        </li>
      </ul>
      <p>実装予定: PR-05</p>
    </main>
  );
}
