// S-07 結果の見本 — the newest featured result, field by field, with an in-browser check against Solana.
import type { Metadata } from "next";
import Link from "next/link";
import { OnchainCheck } from "@/components/onchain-check";
import { PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { env, isDev } from "@/lib/env";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { featuredResults, publicResult } from "@/lib/services/public-service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: pick(await getLang(), "結果の見本 | ProofMarket", "Sample result | ProofMarket") };
}
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
  const lang = await getLang();
  const r = await newest();
  const e = env();
  const programId = isDev(e) ? null : e.PROGRAM_ID;
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "結果の見本", "Sample result")}
        title={pick(lang, "実際の結果を、1項目ずつ読んでみる", "A real result, read field by field")}
      >
        <p>
          {pick(
            lang,
            "運営者が掲載している最新の結果を使って、エージェントに返る内容の意味を説明します。最後に、このページの値が Solana の記録と一致しているかを、あなたのブラウザから確かめられます。",
            "Using the newest result the operator features, this page explains what each field returned to the agent means. At the end you can check from your own browser that the values here match the record on Solana.",
          )}
        </p>
      </PageHero>

      {!r ? (
        <Section
          title={pick(lang, "まだ掲載している結果がありません", "No featured result yet")}
          lead={pick(
            lang,
            "試験運用で最初の結果が出たら、ここに表示します。",
            "The first result from the pilot will appear here.",
          )}
        />
      ) : (
        <>
          <Section title={pick(lang, "結果の中身", "Inside the result")}>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
              <Field name="status / answer" value={`${r.status} / ${r.answer ?? "null"}`}>
                {pick(
                  lang,
                  "確定したかどうかと、確定した答え。VERIFIED のときだけ answer に値が入る",
                  "Whether the result is final, and the final answer. answer is set only when the status is VERIFIED",
                )}
              </Field>
              <Field
                name="witnesses"
                value={`valid ${r.witnesses.valid} / required ${r.witnesses.required} / quorum ${r.witnesses.quorum}`}
              >
                {pick(
                  lang,
                  "確認をすべて通った答えの数、頼んだ人数、確定に必要な一致数",
                  "Answers that passed every check, the number of people asked, and how many must agree",
                )}
              </Field>
              <Field
                name="consensus_ratio"
                value={r.consensus_ratio === null ? "null" : String(r.consensus_ratio)}
              >
                {pick(
                  lang,
                  "いちばん多い答えの数 ÷ 有効な答えの数",
                  "Count of the most common answer divided by the count of valid answers",
                )}
              </Field>
              <Field
                name="checks"
                value={Object.entries(r.checks)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              >
                {pick(
                  lang,
                  "有効だった写真が通った確認。not_run は、その確認をまだ行っていないもの",
                  "The checks the valid photos passed. not_run means that check was not performed",
                )}
              </Field>
              <Field name="evidence_root" value={r.evidence_root}>
                {pick(
                  lang,
                  "有効な提出（答え、写真のハッシュ、確認結果）をまとめて計算したハッシュ。写真そのものは含まない",
                  "A hash computed over the valid submissions (answer, photo hash, check results). The photos themselves are not included",
                )}
              </Field>
              <Field name="result_hash" value={r.result_hash}>
                {pick(
                  lang,
                  "結果の中身から計算したハッシュ。あとで結果を書き換えると、この値が変わる",
                  "A hash of the result's contents. Rewriting the result later would change this value",
                )}
              </Field>
              <Field name="settlement" value={r.settlement.status}>
                {pick(
                  lang,
                  "報酬の支払いの状態。SETTLED なら、有効な答えを出した人への支払いが Solana 上で終わっている",
                  "Payout state. SETTLED means everyone with a valid answer has been paid on Solana",
                )}
              </Field>
            </div>
            <p className="mt-4 text-sm">
              <Link
                href={langHref(lang, `/r/${r.verification_id}`)}
                className="font-semibold text-teal-700 underline"
              >
                {pick(lang, "この結果の公開ページ", "Public page for this result")}
              </Link>
              {r.attestation ? (
                <a
                  href={r.attestation.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-4 text-teal-700 underline"
                >
                  {pick(lang, "Solana Explorer で取引を見る", "View the transaction in Solana Explorer")}
                </a>
              ) : null}
            </p>
          </Section>

          <Section
            title={pick(lang, "Solana の記録と照らし合わせる", "Compare with the record on Solana")}
            lead={pick(
              lang,
              "依頼ごとの口座に記録された evidence_root と result_hash、結果の種類を読み、上の値と比べます。口座がこの結果の ID から作られたものかも確かめます。",
              "Reads the evidence_root, result_hash and result kind stored in the request's on-chain account and compares them with the values above. It also checks that the account was derived from this result's ID.",
            )}
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
                {pick(
                  lang,
                  "この結果はまだ Solana に確定していないか、開発用の環境で動いているため照らし合わせられません。",
                  "This result is not final on Solana yet, or this is a development environment, so there is nothing to compare.",
                )}
              </p>
            )}
          </Section>
        </>
      )}
    </>
  );
}
