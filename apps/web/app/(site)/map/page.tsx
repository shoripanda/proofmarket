// S-12 みんなの地図 — results their requesters chose to publish (01 §4.22). The question, the requested place,
// the answer and the time; never photos or workers.
import { LIMITS } from "@proofmarket/core";
import type { PublicMap } from "@proofmarket/core/schemas/api";
import type { Metadata } from "next";
import Link from "next/link";
import { type MapPoint, PublicMapView } from "@/components/public-map";
import { PageHero, Section } from "@/components/site";
import { answerLabel, taskTypeText } from "@/lib/answers";
import { appContext } from "@/lib/context";
import { type Lang, langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { ago, proofTimeShort } from "@/lib/proof-text";
import { cachedPublicMap } from "@/lib/services/map-service";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(lang, "みんなの地図 | ProofMarket", "Public map | ProofMarket"),
    description: pick(
      lang,
      "人が現地で確かめた事実を、誰でも無料で見られる地図です。",
      "A free map of facts that people checked on the spot.",
    ),
  };
}

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
const answerText = (i: Item, lang: Lang) =>
  i.answer_kind === "number"
    ? `${i.answer}${i.unit ? ` ${i.unit}` : ""}`
    : (answerLabel(lang, i.answer) ?? i.answer);

async function load(): Promise<PublicMap | null> {
  try {
    return await cachedPublicMap(appContext());
  } catch (e) {
    console.error("public map unavailable", e);
    return null;
  }
}

export default async function MapPage() {
  const lang = await getLang();
  const m = await load();
  const now = appContext().now();
  const sep = pick(lang, "・", " · ");
  const people = (k: number) => pick(lang, `${k}人`, `${k} ${k === 1 ? "person" : "people"}`);
  const when = (i: Item) =>
    pick(
      lang,
      `${proofTimeShort(i.verified_at, lang)} に確認（${ago(i.verified_at, now, lang)}）`,
      `checked ${proofTimeShort(i.verified_at, lang)} (${ago(i.verified_at, now, lang)})`,
    );
  const points: MapPoint[] = (m?.items ?? []).map((i) => ({
    id: i.verification_id,
    lat: i.location.lat,
    lng: i.location.lng,
    title: i.place_name ? `${i.place_name}${pick(lang, "｜", " | ")}${i.question}` : i.question,
    answer: answerText(i, lang),
    when: `${when(i)}${sep}${people(i.witnesses)}`,
    href: langHref(lang, i.result_url),
    positive: POSITIVE.has(i.answer),
  }));
  const types = taskTypeText(lang);
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "みんなの地図", "Public map")}
        title={pick(
          lang,
          "人が現地で確かめた事実を、誰でも見られる地図に",
          "Facts people checked on the spot, on a map anyone can see",
        )}
      >
        <p>
          {pick(
            lang,
            `AI エージェントの依頼で人が確かめた結果のうち、依頼者が公開を選んだものを載せています。駅のエレベーターが動いているか、店が開いているかといった事実が、同じ場所へ行くほかの人の役にも立ちます。載せるのは確かめてから${LIMITS.publicMap.maxAgeHours}時間以内の結果です。`,
            `Results that people checked at an AI agent's request, where the requester chose to publish them. Whether a station lift is running or a shop is open helps the next person heading to the same place. Results stay on the map for ${LIMITS.publicMap.maxAgeHours} hours after they were checked.`,
          )}
        </p>
      </PageHero>

      {!m ? (
        <Section
          title={pick(lang, "いまは地図を読み込めません", "The map cannot be loaded right now")}
          lead={pick(
            lang,
            "少し時間をおいて、ページを開き直してください。",
            "Please reload the page in a moment.",
          )}
        />
      ) : (
        <>
          <Section
            title={pick(
              lang,
              `公開されている結果（${m.items.length}件）`,
              `Published results (${m.items.length})`,
            )}
          >
            <PublicMapView points={points} />
            <p className="mt-2 text-xs text-slate-500">
              {pick(
                lang,
                "印の位置は、依頼者が指定した確認先の場所です。確かめた人のいた位置や写真は載せていません。確かめた時点の結果なので、時間がたつと状況が変わることがあります。",
                "Each marker is the place the requester asked about, never where the worker stood, and photos are not shown. A result reflects the moment it was checked; things change.",
              )}
            </p>
            {m.items.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm leading-relaxed text-slate-600">
                {pick(
                  lang,
                  "いま公開されている結果はありません。依頼者が公開を選んだ結果が確定すると、ここに出ます。",
                  "No published results right now. A result appears here once a requester who chose to publish gets a final answer.",
                )}
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
                        {types[i.type]?.name ?? i.type}
                        {i.place_name ? `${sep}${i.place_name}` : ""}
                      </p>
                      <p className="mt-0.5 break-words text-sm text-slate-700">{i.question}</p>
                      <p className="mt-1 text-lg font-bold">{answerText(i, lang)}</p>
                      <p className="text-xs text-slate-500">
                        {when(i)}
                        {sep}
                        {pick(lang, `${i.witnesses}人が確認`, `${people(i.witnesses)} confirmed`)}
                      </p>
                    </div>
                    <Link
                      href={langHref(lang, i.result_url)}
                      className="text-sm font-semibold text-teal-700 hover:underline"
                    >
                      {pick(lang, "確かめた記録を見る →", "See the proof →")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={pick(lang, "結果を地図に載せるには", "Putting a result on the map")}
            lead={pick(
              lang,
              "依頼に publish: true を付けると、結果が確定したときにこの地図へ載ります。付けなければ載りません。",
              "Add publish: true to a request and its result appears here once final. Without it, nothing is published.",
            )}
          >
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
              <p>
                {pick(
                  lang,
                  "公開されるのは、質問文、依頼で指定した場所、答え、確かめた時刻と人数です。場所のある依頼で、答えが選択か数値のものだけが対象です。文章の答えは公開しません。",
                  "What is published: the question, the place named in the request, the answer, the time and the number of people. Only requests with a place and a multiple-choice or numeric answer qualify. Text answers are never published.",
                )}
              </p>
              <p>
                {pick(
                  lang,
                  "載っている内容を消してほしいときは、",
                  "To have something removed, use the request form on the ",
                )}
                <Link href={langHref(lang, "/rules")} className="text-teal-700 underline">
                  {pick(lang, "決まりのページ", "rules page")}
                </Link>
                {pick(lang, "の申し出フォームから連絡してください。使い方は", ". How to use it is in the ")}
                <Link href={langHref(lang, "/developers")} className="text-teal-700 underline">
                  {pick(lang, "開発者向けの説明", "developer guide")}
                </Link>
                {pick(lang, "にあります。", ".")}
              </p>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
