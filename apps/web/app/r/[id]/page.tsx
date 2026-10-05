// Public result page — 02 §5, REQ-X-R-101, 01 §4.21. Written for the person an agent answers: was this checked
// by a human, what was found, when, by how many people, and how to verify it. Never photos, coordinates,
// question text, text answers or workers.
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { OnchainCheck } from "@/components/onchain-check";
import { appContext } from "@/lib/context";
import { env, isDev } from "@/lib/env";
import { ago, proofAnswer, proofHeadline, proofTimeLong, proofTypeName } from "@/lib/proof-text";
import { publicResult } from "@/lib/services/public-service";

export const dynamic = "force-dynamic";

/** What each check means to a reader, in the order shown. */
const CHECK_JA: [string, string][] = [
  ["geofence", "指定された場所で撮られた写真か"],
  ["freshness", "いま撮られた写真か"],
  ["task_nonce", "この依頼のために撮られた写真か"],
  ["replay", "過去の写真の使い回しでないか"],
  ["duplicate", "ほかの人の写真とそっくりでないか"],
  ["media_schema", "写真の形式が正しいか"],
  ["vision_consistency", "写真と答えが依頼に合っているか（AI による確認）"],
];
const STATUS_JA: Record<string, string> = {
  pass: "合格",
  fail: "不合格",
  warning: "注意",
  not_run: "対象外",
};

// One read per request: the metadata and the page both need it.
const load = cache((id: string) => publicResult(appContext(), id).catch(() => null));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await load((await params).id);
  const robots = { index: false, follow: false };
  if (!r) return { title: "確認の結果 | ProofMarket", robots };
  const answer = r.answer_kind === "text" ? null : proofAnswer(r);
  const title = `${proofHeadline(r)}${r.status === "VERIFIED" && answer ? `：${answer}` : ""} | ProofMarket`;
  const description = `${proofTypeName(r.type)}を、${r.witnesses.valid}人が確かめた結果です（${proofTimeLong(r.verified_at)}）。AI の推測ではなく、人が確かめて Solana に記録しました。`;
  return { title, description, robots, openGraph: { title, description, type: "article" } };
}

export default async function PublicResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  const e = env();
  const programId = isDev(e) ? null : e.PROGRAM_ID;
  const ok = r?.status === "VERIFIED";
  const answer = r ? proofAnswer(r) : null;
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-4 bg-white p-6">
      <p className="text-sm font-semibold tracking-wide text-teal-700">ProofMarket｜人が確かめた結果</p>
      {!r ? (
        <p className="rounded-xl bg-slate-100 p-4 text-slate-600">
          まだ結果がありません。人が確かめている途中か、この番号の依頼がありません。
        </p>
      ) : (
        <>
          <section
            className={`rounded-2xl border p-5 ${ok ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-slate-50"}`}
          >
            <p className={`text-2xl font-bold ${ok ? "text-teal-800" : "text-slate-700"}`}>
              {ok ? "✓ " : ""}
              {proofHeadline(r)}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">確かめたこと</dt>
                <dd className="text-base font-semibold">{proofTypeName(r.type)}</dd>
              </div>
              {answer ? (
                <div>
                  <dt className="text-slate-500">答え</dt>
                  <dd className={r.answer_kind === "text" ? "text-base" : "text-2xl font-bold"}>{answer}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500">{ok ? "確かめた時刻" : "結果が出た時刻"}</dt>
                <dd className="text-base font-semibold">
                  {proofTimeLong(r.verified_at)}
                  <span className="ml-2 font-normal text-slate-500">
                    （{ago(r.verified_at, appContext().now())}）
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">確かめた人</dt>
                <dd className="text-base font-semibold">
                  {r.witnesses.valid}人
                  {r.consensus_ratio !== null && r.witnesses.valid > 1 ? (
                    <span className="ml-2 font-normal text-slate-500">
                      （{Math.round(r.consensus_ratio * 100)}% が同じ答え）
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
            {ok ? (
              <p className="mt-4 text-xs leading-relaxed text-slate-600">
                AI
                の推測ではなく、人が実際に確かめた結果です。確かめた時点のものなので、時間がたつと状況が変わることがあります。
              </p>
            ) : null}
          </section>

          {ok ? (
            <section className="rounded-2xl border border-slate-200 p-5">
              <h2 className="font-bold">どう確かめたか</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                確かめた人は、アプリのカメラで写真を撮って答えます。写真は次の点を調べ、通ったものだけを数えています。
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {CHECK_JA.filter(([k]) => (r.checks as Record<string, string>)[k] !== "not_run").map(
                  ([k, label]) => (
                    <li key={k} className="flex items-baseline justify-between gap-3">
                      <span className="text-slate-700">{label}</span>
                      <span className="shrink-0 font-medium">
                        {STATUS_JA[(r.checks as Record<string, string>)[k] ?? ""] ?? "—"}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ) : null}

          <section className="space-y-2 rounded-2xl border border-slate-200 p-5 text-sm">
            <h2 className="font-bold">書き換えられない記録（Solana Devnet）</h2>
            <p className="leading-relaxed text-slate-600">
              この結果の要約と報酬の支払いは、Solana
              のブロックチェーンに記録しています。あとから運営者が書き換えることはできません。
            </p>
            {r.attestation ? (
              <a
                className="inline-block text-teal-700 underline"
                href={r.attestation.explorer_url}
                target="_blank"
                rel="noreferrer"
              >
                Solana Explorer で記録を見る
              </a>
            ) : (
              <p className="text-slate-500">ブロックチェーンへの記録を待っています。</p>
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
            <details className="pt-2 text-xs text-slate-500">
              <summary className="cursor-pointer">技術的な詳細</summary>
              <p className="mt-2 break-all font-mono">verification_id: {id}</p>
              <p className="break-all font-mono">status: {r.status}</p>
              <p className="break-all font-mono">evidence_root: {r.evidence_root}</p>
              <p className="break-all font-mono">result_hash: {r.result_hash}</p>
              <p className="font-mono">settlement: {r.settlement.status}</p>
            </details>
          </section>

          <p className="text-xs leading-relaxed text-slate-500">
            判定はプラットフォームが運用する単一の検証鍵で行っています（分散した検証ではありません）。写真・正確な位置・質問文・文章の答え・確かめた人の情報は、このページに含みません。{" "}
            <Link href="/how-it-works" className="text-teal-700 underline">
              ProofMarket のしくみ
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
