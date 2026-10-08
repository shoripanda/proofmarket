// S-B09 店舗の申告ページ (01 §4.13). Reached only through the secret link the operator sent to the shop.
import type { Metadata } from "next";
import { PageHero, Section } from "@/components/site";
import { StoreReportForm } from "@/components/store-report-form";
import { appContext } from "@/lib/context";
import { pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { storeInfo } from "@/lib/services/store-service";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pick(await getLang(), "店舗からの申告 | ProofMarket", "Shop notice | ProofMarket"),
    robots: { index: false, follow: false },
  };
}
export const dynamic = "force-dynamic";

export default async function StorePage({ params }: { params: Promise<{ token: string }> }) {
  const lang = await getLang();
  const { token } = await params;
  const info = await storeInfo(appContext(), token).catch(() => null);
  if (!info) {
    return (
      <Section
        title={pick(lang, "このリンクは使えません", "This link cannot be used")}
        lead={pick(
          lang,
          "リンクが間違っているか、止められています。運営者に問い合わせてください。",
          "The link is wrong or has been disabled. Please contact the operator.",
        )}
      />
    );
  }
  return (
    <>
      <PageHero eyebrow={pick(lang, "店舗からの申告", "Shop notice")} title={info.place_name}>
        <p>
          {pick(
            lang,
            "今日の営業について申告すると、確認を依頼した側に参考として伝わります。判定そのものは、これまでどおり現地で確かめた人の答えで決まります。申告は日本時間の今日の終わりまで有効です。",
            "What you report about today's opening is passed to requesters for reference. The verdict itself is still decided by the answers of people who check on the spot. A notice is valid until the end of today, Japan time.",
          )}
        </p>
      </PageHero>
      <Section title={pick(lang, "今日の営業", "Today")}>
        <StoreReportForm token={token} initial={info.current} />
      </Section>
    </>
  );
}
