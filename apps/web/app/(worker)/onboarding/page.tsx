// W-02 初回登録 — 02-system-architecture.md §5. Implementation: PR-05.
// Never show the words Solana / wallet / SOL to workers (REQ-X-W-104).

export default function OnboardingPage() {
  return (
    <main>
      <h1>初回登録</h1>
      <p>
        招待コード入力、利用規約・安全ルール・プライバシーポリシーへの同意（受取アドレスがブロックチェーン上で公開されることを含む）、位置とカメラの許可の説明。
      </p>
      <ul>
        <li>
          <code>{"POST /v1/worker/onboarding"}</code>
        </li>
      </ul>
      <p>実装予定: PR-05</p>
    </main>
  );
}
