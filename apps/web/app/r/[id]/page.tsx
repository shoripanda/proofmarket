// Public result page — 02 §5, REQ-X-R-101. Answer, witnesses, checks, evidence root, explorer link, and a
// disclosure that the verifier is a single platform key. Never photos, coordinates, question text or workers.
import { OnchainCheck } from "@/components/onchain-check";
import { appContext } from "@/lib/context";
import { env, isDev } from "@/lib/env";
import { publicResult } from "@/lib/services/public-service";

export const dynamic = "force-dynamic";

const CHECK_JA: Record<string, string> = {
  geofence: "場所（ジオフェンス）",
  freshness: "撮影の鮮度",
  task_nonce: "このタスク専用の合言葉",
  replay: "写真の使い回し",
  media_schema: "写真の形式",
  duplicate: "よく似た写真",
  vision_consistency: "AI 画像チェック",
};
const STATUS_JA: Record<string, string> = {
  pass: "合格",
  fail: "不合格",
  warning: "注意",
  not_run: "未実施",
};

export default async function PublicResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: Awaited<ReturnType<typeof publicResult>> | null = null;
  try {
    r = await publicResult(appContext(), id);
  } catch {
    r = null;
  }
  const e = env();
  const programId = isDev(e) ? null : e.PROGRAM_ID;
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-4 bg-white p-6">
      <p className="text-sm font-semibold tracking-wide text-teal-700">ProofMarket — Verification result</p>
      <p className="break-all font-mono text-xs text-slate-500">{id}</p>
      {!r ? (
        <p className="rounded-xl bg-slate-100 p-4 text-slate-600">
          まだ結果がありません（または存在しません）。
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">結果</p>
            <p className="mt-1 text-3xl font-bold">
              {r.status}
              {r.answer ? ` / ${r.answer}` : ""}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              有効な証言 {r.witnesses.valid} / 必要 {r.witnesses.required}（合意に必要 {r.witnesses.quorum}）
              {r.consensus_ratio !== null ? `・一致率 ${Math.round(r.consensus_ratio * 100)}%` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              確定 {new Date(r.verified_at).toLocaleString("ja-JP")}
            </p>
          </section>
          <section className="rounded-2xl border border-slate-200 p-5">
            <h2 className="mb-3 font-bold">チェック結果</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              {Object.entries(r.checks).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-600">{CHECK_JA[k] ?? k}</dt>
                  <dd className="text-right font-medium">{STATUS_JA[v] ?? v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="space-y-2 rounded-2xl border border-slate-200 p-5 text-sm">
            <h2 className="font-bold">オンチェーンの記録（Solana Devnet）</h2>
            <p className="break-all font-mono text-xs">evidence_root: {r.evidence_root}</p>
            <p className="break-all font-mono text-xs">result_hash: {r.result_hash}</p>
            <p>決済: {r.settlement.status}</p>
            {r.attestation ? (
              <a
                className="inline-block text-teal-700 underline"
                href={r.attestation.explorer_url}
                target="_blank"
                rel="noreferrer"
              >
                Solana Explorer で取引を見る
              </a>
            ) : (
              <p className="text-slate-500">オンチェーンの確定を待っています。</p>
            )}
            {r.attestation?.task_account && programId ? (
              <div className="pt-2">
                <OnchainCheck
                  verificationId={id}
                  status={r.status}
                  evidenceRoot={r.evidence_root}
                  resultHash={r.result_hash}
                  taskAccount={r.attestation.task_account}
                  programId={programId}
                />
              </div>
            ) : null}
          </section>
          <p className="text-xs leading-relaxed text-slate-500">
            判定はプラットフォームが運用する単一の検証鍵で行っています（分散した検証ではありません）。写真・正確な位置・質問文・証言者の情報はこのページに含みません。
          </p>
        </>
      )}
    </main>
  );
}
