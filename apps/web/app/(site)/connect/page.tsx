// S-16 /connect — connect an AI agent in three steps on one page (13 §7, 2026-10-13).
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ConnectFlow } from "@/components/connect-flow";
import { PageHero } from "@/components/site";
import { Plain } from "@/lib/client/plain";
import { publicCluster } from "@/lib/cluster-public";
import { pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(lang, "AI エージェントをつなぐ | ProofMarket", "Connect your AI agent | ProofMarket"),
    description: pick(
      lang,
      "API キーを受け取り、使っている AI を選んで、つながったか確かめる。3 ステップで終わります。",
      "Get an API key, pick the AI you use, check that it is connected. Three steps, one page.",
    ),
  };
}

// The base URL comes from the request so the snippets match the host the reader is on.
export const dynamic = "force-dynamic";

async function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "proofmarket.fun"}`;
}

export default async function ConnectPage() {
  const lang = await getLang();
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "エージェントをつなぐ", "Connect your agent")}
        title={pick(lang, "AI エージェントを 3 ステップでつなぐ", "Connect your AI agent in three steps")}
      >
        <p>
          <Plain>
            {pick(
              lang,
              "キーを受け取って、使っている AI を選んで、つながったか確かめる。このページだけで終わります。",
              "Get a key, pick the AI you use, check that it is connected. Everything happens on this page.",
            )}
          </Plain>
        </p>
      </PageHero>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ConnectFlow base={await baseUrl()} cluster={publicCluster()} />
      </div>
    </>
  );
}
