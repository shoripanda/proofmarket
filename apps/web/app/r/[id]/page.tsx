// Public result page — 02 §5, REQ-X-R-101, 01 §4.21. Written for the person an agent answers: was this checked
// by a human, what was found, when, by how many people, and how to verify it. Never photos, coordinates,
// question text, text answers or workers.

import { RESULT_HASH_FIELDS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { HourglassPicture } from "@/components/hourglass-picture";
import { LedgerPicture } from "@/components/ledger-picture";
import { OnchainCheck } from "@/components/onchain-check";
import { LangProvider } from "@/lib/client/lang";
import { appContext } from "@/lib/context";
import { env, isDev } from "@/lib/env";
import { type Lang, langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import {
  ago,
  proofAnswer,
  proofChallengeLine,
  proofHeadline,
  proofTimeLong,
  proofTypeName,
} from "@/lib/proof-text";
import { publicOnchain, publicResult } from "@/lib/services/public-service";

export const dynamic = "force-dynamic";

/** What each check means to a reader, in the order shown. */
const CHECK_TEXT: [string, string, string][] = [
  ["geofence", "指定された場所で撮られた写真か", "Taken at the requested place?"],
  ["freshness", "いま撮られた写真か", "Taken just now?"],
  ["task_nonce", "この依頼のために撮られた写真か", "Taken for this request?"],
  ["replay", "過去の写真の使い回しでないか", "Not a reused photo?"],
  ["duplicate", "ほかの人の写真とそっくりでないか", "Not near-identical to someone else's photo?"],
  ["media_schema", "写真の形式が正しいか", "Valid photo format?"],
  [
    "vision_consistency",
    "写真と答えが依頼に合っているか（AI による確認）",
    "Photo and answer match the request? (AI review)",
  ],
];
const STATUS_TEXT: Record<Lang, Record<string, string>> = {
  ja: { pass: "合格", fail: "不合格", warning: "注意", not_run: "対象外" },
  en: { pass: "pass", fail: "fail", warning: "warning", not_run: "not run" },
};

// One read per request: the metadata and the page both need it.
const load = cache((id: string) => publicResult(appContext(), id).catch(() => null));
const loadOnchain = (id: string) => publicOnchain(appContext(), id).catch(() => null);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const lang = await getLang();
  const r = await load((await params).id);
  const robots = { index: false, follow: false };
  if (!r) return { title: pick(lang, "確認の結果 | ProofMarket", "Result | ProofMarket"), robots };
  const answer = r.answer_kind === "text" ? null : proofAnswer(r, lang);
  const title = `${proofHeadline(r, lang)}${r.status === "VERIFIED" && answer ? `${pick(lang, "：", ": ")}${answer}` : ""} | ProofMarket`;
  const description = pick(
    lang,
    `${proofTypeName(r.type, lang)}を、${r.witnesses.valid}人が確かめた結果です（${proofTimeLong(r.verified_at, lang)}）。AI の推測ではなく、人が確かめて Solana に記録しました。`,
    `${proofTypeName(r.type, lang)}: checked by ${r.witnesses.valid} ${r.witnesses.valid === 1 ? "person" : "people"} (${proofTimeLong(r.verified_at, lang)}). Not an AI guess: a person checked it, and it is recorded on Solana.`,
  );
  return { title, description, robots, openGraph: { title, description, type: "article" } };
}

export default async function PublicResultPage({ params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const { id } = await params;
  const r = await load(id);
  const facts = r ? await loadOnchain(id) : null;
  const e = env();
  const programId = isDev(e) ? null : e.PROGRAM_ID;
  const ok = r?.status === "VERIFIED";
  const answer = r ? proofAnswer(r, lang) : null;
  const h = (p: string) => langHref(lang, p);
  return (
    <LangProvider lang={lang}>
      <main className="mx-auto min-h-dvh max-w-xl space-y-4 bg-white p-6">
        <p className="text-sm font-semibold tracking-wide text-teal-700">
          {pick(lang, "ProofMarket｜人が確かめた結果", "ProofMarket | Checked by a person")}
        </p>
        {!r ? (
          <p className="rounded-xl bg-slate-100 p-4 text-slate-600">
            {pick(
              lang,
              "まだ結果がありません。人が確かめている途中か、この番号の依頼がありません。",
              "No result yet. Either someone is still checking, or there is no request with this ID.",
            )}
          </p>
        ) : (
          <>
            <section
              className={`rounded-2xl border p-5 ${ok ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-slate-50"}`}
            >
              <p className={`text-2xl font-bold ${ok ? "text-teal-800" : "text-slate-700"}`}>
                {ok ? "✓ " : ""}
                {proofHeadline(r, lang)}
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">{pick(lang, "確かめたこと", "What was checked")}</dt>
                  <dd className="text-base font-semibold">{proofTypeName(r.type, lang)}</dd>
                  {r.published ? (
                    <dd className="mt-1 break-words text-slate-700">
                      {r.published.place_name ? `${r.published.place_name}${pick(lang, "｜", " | ")}` : ""}
                      {r.published.question}
                    </dd>
                  ) : null}
                </div>
                {answer ? (
                  <div>
                    <dt className="text-slate-500">{pick(lang, "答え", "Answer")}</dt>
                    <dd className={r.answer_kind === "text" ? "text-base" : "text-2xl font-bold"}>
                      {answer}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-slate-500">
                    {ok
                      ? pick(lang, "確かめた時刻", "Checked at")
                      : pick(lang, "結果が出た時刻", "Result at")}
                  </dt>
                  <dd className="text-base font-semibold">
                    {proofTimeLong(r.verified_at, lang)}
                    <span className="ml-2 font-normal text-slate-500">
                      ({ago(r.verified_at, appContext().now(), lang)})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">{pick(lang, "確かめた人", "Checked by")}</dt>
                  <dd className="text-base font-semibold">
                    {pick(
                      lang,
                      `${r.witnesses.valid}人`,
                      `${r.witnesses.valid} ${r.witnesses.valid === 1 ? "person" : "people"}`,
                    )}
                    {r.consensus_ratio !== null && r.witnesses.valid > 1 ? (
                      <span className="ml-2 font-normal text-slate-500">
                        {pick(
                          lang,
                          `（${Math.round(r.consensus_ratio * 100)}% が同じ答え）`,
                          `(${Math.round(r.consensus_ratio * 100)}% gave the same answer)`,
                        )}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              {proofChallengeLine(r, lang) ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/70 p-3">
                  <HourglassPicture done={r.challenge?.state !== "open"} className="h-14 w-10 shrink-0" />
                  <p className="text-sm leading-relaxed text-slate-700">{proofChallengeLine(r, lang)}</p>
                </div>
              ) : null}
              {r.published ? (
                <p className="mt-4 text-sm">
                  <a
                    className="text-teal-700 underline"
                    href={`https://www.openstreetmap.org/?mlat=${r.published.location.lat}&mlon=${r.published.location.lng}#map=17/${r.published.location.lat}/${r.published.location.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {pick(lang, "確認先の場所を地図で見る", "See the place on a map")}
                  </a>
                  <span className="mx-2 text-slate-300">|</span>
                  <Link className="text-teal-700 underline" href={h("/map")}>
                    {pick(lang, "みんなの地図", "Public map")}
                  </Link>
                </p>
              ) : null}
              {ok ? (
                <p className="mt-4 text-xs leading-relaxed text-slate-600">
                  {pick(
                    lang,
                    "AI の推測ではなく、人が実際に確かめた結果です。確かめた時点のものなので、時間がたつと状況が変わることがあります。",
                    "Not an AI guess: a person actually checked this. It reflects the moment it was checked; things change over time.",
                  )}
                </p>
              ) : null}
            </section>

            {ok ? (
              <section className="rounded-2xl border border-slate-200 p-5">
                <h2 className="font-bold">{pick(lang, "どう確かめたか", "How it was checked")}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {pick(
                    lang,
                    "確かめた人は、アプリのカメラで写真を撮って答えます。写真は次の点を調べ、通ったものだけを数えています。",
                    "The person takes a photo with the app's camera and answers. Each photo is checked as follows, and only those that pass are counted.",
                  )}
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {CHECK_TEXT.filter(([k]) => (r.checks as Record<string, string>)[k] !== "not_run").map(
                    ([k, ja, en]) => (
                      <li key={k} className="flex items-baseline justify-between gap-3">
                        <span className="text-slate-700">{pick(lang, ja, en)}</span>
                        <span className="shrink-0 font-medium">
                          {STATUS_TEXT[lang][(r.checks as Record<string, string>)[k] ?? ""] ?? "—"}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2 rounded-2xl border border-slate-200 p-5 text-sm">
              <h2 className="font-bold">
                {pick(
                  lang,
                  "書き換えられない記録（Solana Devnet）",
                  "A record that cannot be rewritten (Solana Devnet)",
                )}
              </h2>
              <p className="leading-relaxed text-slate-600">
                {pick(
                  lang,
                  "この結果の要約と報酬の支払いは、Solana のブロックチェーンに記録しています。あとから運営者が書き換えることはできません。",
                  "A summary of this result and the payout are recorded on the Solana blockchain. The operator cannot rewrite them afterwards.",
                )}
              </p>
              {r.attestation ? (
                <a
                  className="inline-block text-teal-700 underline"
                  href={r.attestation.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {pick(lang, "Solana Explorer で記録を見る", "See the record in Solana Explorer")}
                </a>
              ) : (
                <p className="text-slate-500">
                  {pick(
                    lang,
                    "ブロックチェーンへの記録を待っています。",
                    "Waiting for the blockchain record.",
                  )}
                </p>
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
                <summary className="cursor-pointer">
                  {pick(lang, "技術的な詳細", "Technical details")}
                </summary>
                <p className="mt-2 break-all font-mono">verification_id: {id}</p>
                <p className="break-all font-mono">status: {r.status}</p>
                <p className="break-all font-mono">evidence_root: {r.evidence_root}</p>
                <p className="break-all font-mono">result_hash: {r.result_hash}</p>
                <p className="font-mono">settlement: {r.settlement.status}</p>
              </details>
            </section>

            {facts?.recorded ? (
              <section className="space-y-3 rounded-2xl border border-slate-200 p-5 text-sm">
                <h2 className="font-bold">{pick(lang, "プログラムから読む", "Read it from a program")}</h2>
                <div className="flex items-center gap-4">
                  <LedgerPicture className="h-16 w-28 shrink-0" />
                  <p className="text-base leading-relaxed text-slate-700">
                    {pick(
                      lang,
                      "この答えは、だれにも書き換えられない台帳に 1 行で残っています。",
                      "This answer is kept as one line in a ledger no one can rewrite.",
                    )}
                  </p>
                </div>
                <p className="leading-relaxed text-slate-600">
                  {pick(
                    lang,
                    "保険や予約のプログラムは、この行を直接読み、答えに合わせて動けます。",
                    "An insurance or booking program can read this line directly and act on the answer.",
                  )}
                </p>
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer text-sm text-slate-700">
                    {pick(lang, "読み方（開発者向け）", "How to read it (for developers)")}
                  </summary>
                  <dl className="mt-3 space-y-3">
                    <div>
                      <dt className="font-semibold">
                        {pick(lang, "台帳の行（Task 口座の PDA）", "The line (Task account PDA)")}
                      </dt>
                      <dd className="mt-1 break-all font-mono">
                        <a
                          className="text-teal-700 underline"
                          href={facts.explorer_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {facts.task_account}
                        </a>
                      </dd>
                      <dd className="mt-1 break-all font-mono text-slate-500">
                        seeds = ["task", sha256("proofmarket:task:v1:" + verification_id)]
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">
                        {pick(lang, "result_hash の作り方", "How result_hash is made")}
                      </dt>
                      <dd className="mt-1 leading-relaxed">
                        {pick(
                          lang,
                          "結果のうち次の項目だけを JCS（RFC 8785）で並べ、SHA-256 をとります。proof・type・answer_kind・published などの付け足しの項目は入れません。公開の結果には rejected_submissions が無いので、空の {} として計算します（落ちた提出があった依頼と、数値の集計 aggregate がある依頼では、依頼者の結果でしか一致しません）。",
                          "Take only these fields of the result, canonicalise them with JCS (RFC 8785) and hash with SHA-256. Added fields such as proof, type, answer_kind and published are left out. The public result has no rejected_submissions, so it counts as {} (a request with rejected submissions, or with a numeric aggregate, only matches from the requester's result).",
                        )}
                      </dd>
                      <dd className="mt-1 break-all font-mono">{RESULT_HASH_FIELDS.join(", ")}</dd>
                      <dd className="mt-1 break-all font-mono">result_hash: {facts.result_hash}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">
                        {pick(lang, "Rust（Anchor のプログラムの中で）", "Rust (inside an Anchor program)")}
                      </dt>
                      <dd>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                          {facts.how_to_read.rust}
                        </pre>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">
                        {pick(
                          lang,
                          "TypeScript（@solana/web3.js だけで）",
                          "TypeScript (@solana/web3.js only)",
                        )}
                      </dt>
                      <dd>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                          {facts.how_to_read.typescript}
                        </pre>
                      </dd>
                    </div>
                    <p className="leading-relaxed">
                      {pick(lang, "同じ内容を機械向けに返す API: ", "The same, for machines: ")}
                      <a
                        className="break-all font-mono text-teal-700 underline"
                        href={`/v1/public/verifications/${id}/onchain`}
                      >
                        GET /v1/public/verifications/{id}/onchain
                      </a>
                    </p>
                  </dl>
                </details>
              </section>
            ) : null}

            <p className="text-xs leading-relaxed text-slate-500">
              {pick(
                lang,
                "判定はプラットフォームが運用する単一の検証鍵で行っています（分散した検証ではありません）。写真・確かめた人の情報・文章の答えは、このページに含みません。質問文と場所は、依頼者が公開を選んだときだけ出します。",
                "Results are finalised with a single verification key run by the platform (not decentralised verification). Photos, the people who checked and text answers are not on this page. The question and the place appear only when the requester chose to publish them.",
              )}{" "}
              <Link href={h("/how-it-works")} className="text-teal-700 underline">
                {pick(lang, "ProofMarket のしくみ", "How ProofMarket works")}
              </Link>
            </p>
          </>
        )}
      </main>
    </LangProvider>
  );
}
