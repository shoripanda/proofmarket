// S-07 結果の見本 — the newest featured result, field by field, with an in-browser check against Solana.
import type { Metadata } from "next";
import Link from "next/link";
import { OnchainCheck } from "@/components/onchain-check";
import { PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { env, isDev } from "@/lib/env";
import { featuredResults, publicResult } from "@/lib/services/public-service";

export const metadata: Metadata = { title: "結果の見本 | ProofMarket" };
export const dynamic = "force-dynamic";

async function newest() {
  try {
    const [f] = await featuredResults(appContext(), 1);
    return f ? await publicResult(appContext(), f.verification_id) : null;
  } catch {
    return null;
  }
}

function Field({ name, value, children }: { name: string; value: string; children: string }) {
  return (
    <div className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr]">
      <div>
        <p className="font-mono text-sm font-semibold">{name}</p>
        <p className="break-all font-mono text-xs text-teal-800">{value}</p>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

export default async function DemoPage() {
  const r = await newest();
  const e = env();
  const programId = isDev(e) ? null : e.PROGRAM_ID;
  return (
    <>
      <PageHero eyebrow="結果の見本" title="実際の結果を、1項目ずつ読んでみる">
        <p>
          運営者が掲載している最新の結果を使って、エージェントに返る内容の意味を説明します。最後に、このページの値が
          Solana の記録と一致しているかを、あなたのブラウザから確かめられます。
        </p>
      </PageHero>

      {!r ? (
        <Section
          title="まだ掲載している結果がありません"
          lead="試験運用で最初の結果が出たら、ここに表示します。"
        />
      ) : (
        <>
          <Section title="結果の中身">
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
              <Field name="status / answer" value={`${r.status} / ${r.answer ?? "null"}`}>
                確定したかどうかと、確定した答え。VERIFIED のときだけ answer に値が入る
              </Field>
              <Field
                name="witnesses"
                value={`valid ${r.witnesses.valid} / required ${r.witnesses.required} / quorum ${r.witnesses.quorum}`}
              >
                確認をすべて通った答えの数、頼んだ人数、確定に必要な一致数
              </Field>
              <Field
                name="consensus_ratio"
                value={r.consensus_ratio === null ? "null" : String(r.consensus_ratio)}
              >
                いちばん多い答えの数 ÷ 有効な答えの数
              </Field>
              <Field
                name="checks"
                value={Object.entries(r.checks)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              >
                有効だった写真が通った確認。not_run は、その確認をまだ行っていないもの
              </Field>
              <Field name="evidence_root" value={r.evidence_root}>
                有効な提出（答え、写真のハッシュ、確認結果）をまとめて計算したハッシュ。写真そのものは含まない
              </Field>
              <Field name="result_hash" value={r.result_hash}>
                結果の中身から計算したハッシュ。あとで結果を書き換えると、この値が変わる
              </Field>
              <Field name="settlement" value={r.settlement.status}>
                報酬の支払いの状態。SETTLED なら、有効な答えを出した人への支払いが Solana 上で終わっている
              </Field>
            </div>
            <p className="mt-4 text-sm">
              <Link href={`/r/${r.verification_id}`} className="font-semibold text-teal-700 underline">
                この結果の公開ページ
              </Link>
              {r.attestation ? (
                <a
                  href={r.attestation.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-4 text-teal-700 underline"
                >
                  Solana Explorer で取引を見る
                </a>
              ) : null}
            </p>
          </Section>

          <Section
            title="Solana の記録と照らし合わせる"
            lead="依頼ごとの口座に記録された evidence_root と result_hash、結果の種類を読み、上の値と比べます。口座がこの結果の ID から作られたものかも確かめます。"
          >
            {r.attestation?.task_account && programId ? (
              <OnchainCheck
                verificationId={r.verification_id}
                status={r.status}
                evidenceRoot={r.evidence_root}
                resultHash={r.result_hash}
                taskAccount={r.attestation.task_account}
                programId={programId}
              />
            ) : (
              <p className="text-sm text-slate-600">
                この結果はまだ Solana に確定していないか、開発用の環境で動いているため照らし合わせられません。
              </p>
            )}
          </Section>
        </>
      )}
    </>
  );
}
