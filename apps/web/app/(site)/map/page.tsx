// S-12 みんなの地図 — results their requesters chose to publish (01 §4.22). The question, the requested place,
// the answer and the time; never photos or workers.
import { LIMITS } from "@proofmarket/core";
import type { PublicMap } from "@proofmarket/core/schemas/api";
import type { Metadata } from "next";
import Link from "next/link";
import { type MapPoint, PublicMapView } from "@/components/public-map";
import { PageHero, Section } from "@/components/site";
import { answerJa, TASK_TYPE_JA } from "@/lib/answers";
import { appContext } from "@/lib/context";
import { ago, proofTimeShort } from "@/lib/proof-text";
import { cachedPublicMap } from "@/lib/services/map-service";

export const metadata: Metadata = {
  title: "みんなの地図 | ProofMarket",
  description: "人が現地で確かめた事実を、誰でも無料で見られる地図です。",
};

// Read from the DB per request (cached about a minute in the service).
export const dynamic = "force-dynamic";

const POSITIVE = new Set([
  "OPEN",
  "NO_QUEUE",
  "POSTED",
  "EMPTY",
  "SEATS_AVAILABLE",
  "SPACES_AVAILABLE",
  "IN_STOCK",
]);

type Item = PublicMap["items"][number];
const answerText = (i: Item) =>
  i.answer_kind === "number" ? `${i.answer}${i.unit ? ` ${i.unit}` : ""}` : (answerJa(i.answer) ?? i.answer);

async function load(): Promise<PublicMap | null> {
  try {
    return await cachedPublicMap(appContext());
  } catch (e) {
    console.error("public map unavailable", e);
    return null;
  }
}

export default async function MapPage() {
  const m = await load();
  const now = appContext().now();
  const when = (i: Item) => `${proofTimeShort(i.verified_at)} に確認（${ago(i.verified_at, now)}）`;
  const points: MapPoint[] = (m?.items ?? []).map((i) => ({
    id: i.verification_id,
    lat: i.location.lat,
    lng: i.location.lng,
    title: i.place_name ? `${i.place_name}｜${i.question}` : i.question,
    answer: answerText(i),
    when: `${when(i)}・${i.witnesses}人`,
    href: i.result_url,
    positive: POSITIVE.has(i.answer),
  }));
  return (
    <>
      <PageHero eyebrow="みんなの地図" title="人が現地で確かめた事実を、誰でも見られる地図に">
        <p>
          AI
          エージェントの依頼で人が確かめた結果のうち、依頼者が公開を選んだものを載せています。駅のエレベーターが動いているか、店が開いているかといった事実が、同じ場所へ行くほかの人の役にも立ちます。載せるのは確かめてから
          {LIMITS.publicMap.maxAgeHours}時間以内の結果です。
        </p>
      </PageHero>

      {!m ? (
        <Section title="いまは地図を読み込めません" lead="少し時間をおいて、ページを開き直してください。" />
      ) : (
        <>
          <Section title={`公開されている結果（${m.items.length}件）`}>
            <PublicMapView points={points} />
            <p className="mt-2 text-xs text-slate-500">
              印の位置は、依頼者が指定した確認先の場所です。確かめた人のいた位置や写真は載せていません。確かめた時点の結果なので、時間がたつと状況が変わることがあります。
            </p>
            {m.items.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm leading-relaxed text-slate-600">
                いま公開されている結果はありません。依頼者が公開を選んだ結果が確定すると、ここに出ます。
              </p>
            ) : (
              <ul className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200">
                {m.items.map((i) => (
                  <li
                    key={i.verification_id}
                    className="grid gap-1 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        {TASK_TYPE_JA[i.type]?.name ?? i.type}
                        {i.place_name ? `・${i.place_name}` : ""}
                      </p>
                      <p className="mt-0.5 break-words text-sm text-slate-700">{i.question}</p>
                      <p className="mt-1 text-lg font-bold">{answerText(i)}</p>
                      <p className="text-xs text-slate-500">
                        {when(i)}・{i.witnesses}人が確認
                      </p>
                    </div>
                    <Link href={i.result_url} className="text-sm font-semibold text-teal-700 hover:underline">
                      確かめた記録を見る →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="結果を地図に載せるには"
            lead="依頼に publish: true を付けると、結果が確定したときにこの地図へ載ります。付けなければ載りません。"
          >
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
              <p>
                公開されるのは、質問文、依頼で指定した場所、答え、確かめた時刻と人数です。場所のある依頼で、答えが選択か数値のものだけが対象です。文章の答えは公開しません。
              </p>
              <p>
                載っている内容を消してほしいときは、
                <Link href="/rules" className="text-teal-700 underline">
                  決まりのページ
                </Link>
                の申し出フォームから連絡してください。使い方は
                <Link href="/developers" className="text-teal-700 underline">
                  開発者向けの説明
                </Link>
                にあります。
              </p>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
