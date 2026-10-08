// S-14 データ — the open dataset of human-verified observations (01 §4.24): what is in it, the licence, how to fetch.
import type { Metadata } from "next";
import Link from "next/link";
import { Code, PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { cachedPublicDataset } from "@/lib/services/map-service";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(
      lang,
      "人が確かめた実世界データ | ProofMarket",
      "Human-verified real-world data | ProofMarket",
    ),
    description: pick(
      lang,
      "人が現地で確かめ、時刻と場所が付き、Solana に記録された観測を、誰でも機械で読める形で取り出せます。",
      "Observations checked by people on the spot, stamped with time and place and recorded on Solana, in a machine-readable form anyone can fetch.",
    ),
  };
}

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const lang = await getLang();
  const d = await cachedPublicDataset(appContext()).catch(() => null);
  const sample = d?.rows[0] ?? null;
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "データ", "Data")}
        title={pick(
          lang,
          "人が現地で確かめた観測を、AI が使える形で",
          "Observations people checked on the spot, in a form AI can use",
        )}
      >
        <p>
          {pick(
            lang,
            "依頼者が公開を許した結果は、地図に載るだけでなく、ここから機械で読める形で取り出せます。1件ごとに、何を・どこで・いつ・何人が確かめたかと、証拠と結果のハッシュ、Solana の取引が付いています。写真と確かめた人の情報は入っていません。",
            "Results their requesters chose to publish go on the map and can also be fetched here in a machine-readable form. Each row says what was checked, where, when and by how many people, with the evidence and result hashes and the Solana transaction. Photos and the people who checked are not included.",
          )}
        </p>
      </PageHero>

      <Section
        title={
          d
            ? pick(lang, `いま取り出せる観測：${d.count}件`, `Observations available now: ${d.count}`)
            : pick(lang, "いまは読み込めません", "Cannot be loaded right now")
        }
        lead={pick(
          lang,
          "確定してから時間がたった観測も残します。地図の72時間は案内のための区切りで、観測としての価値は消えないからです。",
          "Older observations stay in the dataset. The map's 72-hour window is for people on the move; an observation keeps its value as data.",
        )}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Code>
              {pick(
                lang,
                `# JSON（最大1000件、新しい順）
curl https://proofmarket.fun/v1/public/dataset

# 1行1件の JSONL
curl https://proofmarket.fun/v1/public/dataset.jsonl`,
                `# JSON (up to 1000 rows, newest first)
curl https://proofmarket.fun/v1/public/dataset

# JSONL, one row per line
curl https://proofmarket.fun/v1/public/dataset.jsonl`,
              )}
            </Code>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {pick(lang, "利用条件は ", "Licensed under ")}
              <b>CC BY 4.0</b>
              {pick(
                lang,
                " です。出典として ProofMarket と、各行の ",
                ". Credit ProofMarket and each row's ",
              )}
              <code className="font-mono">proof_url</code>
              {pick(lang, " を示してください。各行の ", ". Each row's ")}
              <code className="font-mono">result_hash</code>
              {pick(
                lang,
                " は Solana の取引に記録されているので、改ざんされていないことを自分で確かめられます。",
                " is recorded in a Solana transaction, so you can verify yourself that nothing was altered.",
              )}
            </p>
          </div>
          <Code>
            {sample
              ? JSON.stringify(sample, null, 2)
              : `{
  "verification_id": "ver_…",
  "type": "PLACE_STATUS_VERIFICATION",
  "question": "…",
  "answer": "OPEN",
  "answer_kind": "enum",
  "location": { "lat": 35.6595, "lng": 139.7005 },
  "location_precision_m": null,
  "place_name": "…",
  "witnesses": 2,
  "verified_at": "2026-10-07T03:00:00.000Z",
  "evidence_root": "…", "result_hash": "…",
  "attestation": { "network": "solana-devnet", "signature": "…", "explorer_url": "…" },
  "proof_url": "https://proofmarket.fun/r/ver_…"
}`}
          </Code>
        </div>
      </Section>

      <Section title={pick(lang, "何に使えるか", "What it is good for")}>
        <ul className="grid gap-3 text-sm leading-relaxed text-slate-700 sm:grid-cols-3">
          <li className="rounded-2xl bg-slate-50 p-4">
            <b>{pick(lang, "エージェントの事前確認。", "Pre-checks for agents. ")}</b>
            {pick(
              lang,
              "依頼を出す前に、同じ場所の最近の観測があるかを調べる。",
              "Before sending a request, look for a recent observation at the same place.",
            )}
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            <b>{pick(lang, "AI と Physical AI の評価。", "Evaluating AI and physical AI. ")}</b>
            {pick(
              lang,
              "「人が確かめた正解」として、モデルの答えと突き合わせる。時刻と場所が付いているので、鮮度を考慮できる。",
              "Use human-verified ground truth to score a model's answers. Time and place come with every row, so freshness can be taken into account.",
            )}
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            <b>{pick(lang, "街の研究と公共の案内。", "Urban research and public information. ")}</b>
            {pick(
              lang,
              "駅の設備や店の営業の実態を、申告ではなく観測で見る。",
              "See how station facilities and shops really operate, from observation rather than self-reporting.",
            )}
          </li>
        </ul>
        <p className="mt-6 text-sm text-slate-600">
          {pick(lang, "結果をここに載せるには、依頼に ", "To publish a result here, add ")}
          <code className="font-mono">publish: true</code>
          {pick(lang, " を付けます（", " to the request (")}
          <Link href={langHref(lang, "/developers")} className="font-semibold text-teal-700 underline">
            {pick(lang, "開発者向けの説明", "developer guide")}
          </Link>
          {pick(
            lang,
            "）。載っている内容を消してほしいときは、",
            "). To have something removed, use the request form on the ",
          )}
          <Link href={langHref(lang, "/rules")} className="font-semibold text-teal-700 underline">
            {pick(lang, "決まりのページ", "rules page")}
          </Link>
          {pick(lang, "の申し出フォームから連絡してください。", ".")}
        </p>
      </Section>
    </>
  );
}
