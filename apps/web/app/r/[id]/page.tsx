// Public result page — 02 §5, REQ-X-R-101 (P1). Implementation: PR-12.
// Shows answer, witness count, checks, evidence_root, explorer link, and a disclosure that the verifier is a
// single platform key. Never shows photos, coordinates, question text or worker information.

export default async function PublicResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <h1>Verification result</h1>
      <p>
        <code>{id}</code>
      </p>
      <p>Implementation: PR-12</p>
    </main>
  );
}
