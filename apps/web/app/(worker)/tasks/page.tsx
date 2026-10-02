// W-03 タスク一覧 — 02-system-architecture.md §5. Implementation: PR-05.
// Never show the words Solana / wallet / SOL to workers (REQ-X-W-104).

export default function TasksPage() {
  return (
    <main>
      <h1>タスク一覧</h1>
      <p>現在地（小数3桁に丸める）から近い順。報酬、距離、残り時間、必要な証拠。</p>
      <ul>
        <li>
          <code>{"GET /v1/worker/tasks"}</code>
        </li>
      </ul>
      <p>実装予定: PR-05</p>
    </main>
  );
}
