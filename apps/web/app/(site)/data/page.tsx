// S-14 データ — the open dataset of human-verified observations (01 §4.24): what is in it, the licence, how to fetch.
import type { Metadata } from "next";
import Link from "next/link";
import { Code, PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { cachedPublicDataset } from "@/lib/services/map-service";

export const metadata: Metadata = {
  title: "人が確かめた実世界データ | ProofMarket",
  description:
    "人が現地で確かめ、時刻と場所が付き、Solana に記録された観測を、誰でも機械で読める形で取り出せます。",
};

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const d = await cachedPublicDataset(appContext()).catch(() => null);
  const sample = d?.rows[0] ?? null;
  return (
    <>
      <PageHero eyebrow="データ" title="人が現地で確かめた観測を、AI が使える形で">
        <p>
          依頼者が公開を許した結果は、地図に載るだけでなく、ここから機械で読める形で取り出せます。1件ごとに、何を・どこで・いつ・何人が確かめたかと、証拠と結果のハッシュ、Solana
          の取引が付いています。写真と確かめた人の情報は入っていません。
        </p>
      </PageHero>

      <Section
        title={d ? `いま取り出せる観測：${d.count}件` : "いまは読み込めません"}
        lead="確定してから時間がたった観測も残します。地図の72時間は案内のための区切りで、観測としての価値は消えないからです。"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Code>{`# JSON（最大1000件、新しい順）
curl https://proofmarket.fun/v1/public/dataset

# 1行1件の JSONL
curl https://proofmarket.fun/v1/public/dataset.jsonl`}</Code>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              利用条件は <b>CC BY 4.0</b> です。出典として ProofMarket と、各行の{" "}
              <code className="font-mono">proof_url</code> を示してください。各行の{" "}
              <code className="font-mono">result_hash</code> は Solana
              の取引に記録されているので、改ざんされていないことを自分で確かめられます。
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

      <Section title="何に使えるか">
        <ul className="grid gap-3 text-sm leading-relaxed text-slate-700 sm:grid-cols-3">
          <li className="rounded-2xl bg-slate-50 p-4">
            <b>エージェントの事前確認。</b>依頼を出す前に、同じ場所の最近の観測があるかを調べる。
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            <b>AI と Physical AI の評価。</b>
            「人が確かめた正解」として、モデルの答えと突き合わせる。時刻と場所が付いているので、鮮度を考慮できる。
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            <b>街の研究と公共の案内。</b>駅の設備や店の営業の実態を、申告ではなく観測で見る。
          </li>
        </ul>
        <p className="mt-6 text-sm text-slate-600">
          結果をここに載せるには、依頼に <code className="font-mono">publish: true</code> を付けます（
          <Link href="/developers" className="font-semibold text-teal-700 underline">
            開発者向けの説明
          </Link>
          ）。載っている内容を消してほしいときは、
          <Link href="/rules" className="font-semibold text-teal-700 underline">
            決まりのページ
          </Link>
          の申し出フォームから連絡してください。
        </p>
      </Section>
    </>
  );
}
