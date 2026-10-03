// S-B09 店舗の申告ページ (01 §4.13). Reached only through the secret link the operator sent to the shop.
import type { Metadata } from "next";
import { PageHero, Section } from "@/components/site";
import { StoreReportForm } from "@/components/store-report-form";
import { appContext } from "@/lib/context";
import { storeInfo } from "@/lib/services/store-service";

export const metadata: Metadata = {
  title: "店舗からの申告 | ProofMarket",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function StorePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await storeInfo(appContext(), token).catch(() => null);
  if (!info) {
    return (
      <Section
        title="このリンクは使えません"
        lead="リンクが間違っているか、止められています。運営者に問い合わせてください。"
      />
    );
  }
  return (
    <>
      <PageHero eyebrow="店舗からの申告" title={info.place_name}>
        <p>
          今日の営業について申告すると、確認を依頼した側に参考として伝わります。判定そのものは、これまでどおり現地で確かめた人の答えで決まります。申告は日本時間の今日の終わりまで有効です。
        </p>
      </PageHero>
      <Section title="今日の営業">
        <StoreReportForm token={token} initial={info.current} />
      </Section>
    </>
  );
}
