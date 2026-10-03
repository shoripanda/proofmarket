// S-03 開発者向け — connect over MCP or REST, the request fields, and how to read the result.
import { LIMITS, TASK_TYPE_ANSWERS, WEBHOOK_EVENTS } from "@proofmarket/core";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Code, PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "開発者向け | ProofMarket" };
export const dynamic = "force-dynamic";

async function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "<your-app>"}`;
}

const TOOLS = [
  ["request_reality_verification", "質問を出す。verification_id がすぐ返り、結果は後から読む"],
  ["get_reality_verification", "状態と結果を読む。wait_seconds（最大20秒）で変化を待てる"],
  ["cancel_reality_verification", "まだ誰も向かっていない依頼を取り消す。拘束した額は残高に戻る"],
];

const FIELDS: [string, string][] = [
  [
    "question",
    `確かめたいこと。${LIMITS.question.maxChars}字まで。人の尾行や私有地への立ち入りが要る質問は受け付けない`,
  ],
  [
    "type",
    "PLACE_STATUS_VERIFICATION（営業しているか）、QUEUE_LENGTH（店の外の行列）、NOTICE_POSTED（店頭の掲示）。後ろの2つは API キーごとに許可したときだけ使える",
  ],
  [
    "answer_schema.values",
    `答えの選択肢を2個以上。type ごとに ${Object.entries(TASK_TYPE_ANSWERS)
      .map(([t, v]) => `${t}: ${v.join("・")}`)
      .join("、")} から選ぶ`,
  ],
  [
    "location",
    `緯度・経度と半径（${LIMITS.radiusM.min}〜${LIMITS.radiusM.max}m）。登録済みの店舗の${LIMITS.placeMatchRadiusM}m以内であること`,
  ],
  [
    "deadline",
    `締め切り。今から${LIMITS.deadlineFromNow.minMinutes}分後〜${LIMITS.deadlineFromNow.maxHours}時間後`,
  ],
  [
    "freshness.max_age_seconds",
    `写真が撮られてから何秒以内なら有効か。${LIMITS.freshnessMaxAgeS.min}〜${LIMITS.freshnessMaxAgeS.max}秒、既定は${LIMITS.freshnessMaxAgeS.default}秒`,
  ],
  [
    "assurance",
    `何人に確かめてもらうか（required_witnesses、最大${LIMITS.witnesses.max}人）と、何人の答えがそろえば確定か（quorum）。{ "level": "fast" | "standard" | "high" } と書けば、それぞれ1人・2人一致・3人中2人になる`,
  ],
  ["bounty", "1人あたりの報酬。試験運用中は Solana Devnet のテスト用 USDC"],
];

const OUTCOMES: [string, string][] = [
  ["VERIFIED", "quorum 以上の答えがそろった。answer に答えが入る"],
  ["REJECTED", "答えが割れた（NO_CONSENSUS）か、有効な証言が足りなかった"],
  ["EXPIRED", "締め切りまでに確定しなかった。拘束した額は返金される"],
];

export default async function DevelopersPage() {
  const base = await baseUrl();
  const createBody = `{
  "type": "PLACE_STATUS_VERIFICATION",
  "question": "この店はいま営業していますか？",
  "answer_schema": { "type": "enum", "values": ["OPEN", "CLOSED", "UNCLEAR"] },
  "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
  "deadline": "2026-10-12T12:00:00+09:00",
  "evidence_requirements": { "photo": true, "task_nonce": true },
  "assurance": { "level": "standard" },
  "bounty": { "asset": "USDC", "amount": "0.5", "network": "solana-devnet" },
  "principal_ref": "prn_..."
}`;
  return (
    <>
      <PageHero eyebrow="開発者向け" title="エージェントに、現地を確かめる手段を持たせる">
        <p>
          MCP のツールを3つ足すか、REST API
          を呼ぶだけで使えます。人を探す、連絡する、支払うといった手間はすべて ProofMarket
          が引き受け、エージェントには判定済みの結果だけが返ります。
        </p>
      </PageHero>

      <Section
        title="つなぎ方は3通りあります"
        lead={
          <>
            どれを選んでも、使えるキーと上限は同じです。試験運用中は API キー（pm_test_
            で始まる）を運営者が発行します。
            <a href="/join?role=requester" className="ml-1 font-semibold text-teal-700 underline">
              API キーを申し込む
            </a>
          </>
        }
      >
        <div className="space-y-8">
          <div>
            <h3 className="font-bold">claude.ai などのリモート MCP</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              コネクタの追加画面にこの URL を入れます。接続のときに ProofMarket の画面が開くので、そこで API
              キーを入れます。キーがアプリ側に保存されることはありません。
            </p>
            <div className="mt-3">
              <Code>{`${base}/mcp`}</Code>
            </div>
          </div>
          <div>
            <h3 className="font-bold">Claude Code などのローカルのエージェント</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              同じ URL に、API キーをヘッダーで渡して登録します。
            </p>
            <div className="mt-3">
              <Code>{`claude mcp add --transport http proofmarket ${base}/mcp \\
  --header "Authorization: Bearer pm_test_..."`}</Code>
            </div>
          </div>
          <div>
            <h3 className="font-bold">REST API</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              依頼の作成には Idempotency-Key
              ヘッダーが要ります。同じキーで送り直しても、依頼は1件しかできません。
            </p>
            <div className="mt-3 space-y-3">
              <Code>{`curl -X POST ${base}/v1/verifications \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d @request.json`}</Code>
              <Code>{`curl ${base}/v1/verifications/ver_... \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY"`}</Code>
            </div>
          </div>
        </div>
      </Section>

      <Section title="MCP のツール">
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {TOOLS.map(([name, desc]) => (
            <div key={name} className="grid gap-1 p-4 sm:grid-cols-[18rem_1fr]">
              <dt className="break-all font-mono text-sm font-semibold">{name}</dt>
              <dd className="text-sm text-slate-600">{desc}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          人が現地まで行くので、結果が出るまでふつう10〜60分かかります。状態が VERIFIED・REJECTED・EXPIRED
          のどれかになるまで、エージェントに答えを推測させないでください。
        </p>
      </Section>

      <Section
        title="依頼の中身"
        lead="request.json の例です。principal_ref は API キーと一緒に渡される ID です。"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Code>{createBody}</Code>
          <dl className="space-y-3 text-sm">
            {FIELDS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono font-semibold">{k}</dt>
                <dd className="mt-0.5 leading-relaxed text-slate-600">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section
        title="結果の読み方"
        lead="status が次の3つのどれかになったら確定です。確定までの途中の状態（OPEN、CLAIMED など）では result は null です。"
      >
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {OUTCOMES.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
              <dt className="font-mono text-sm font-semibold">{k}</dt>
              <dd className="text-sm text-slate-600">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          result には答えのほかに、有効な証言の数、一致率、場所・鮮度・写真の使い回しなどの確認結果、Solana
          に記録した証拠のハッシュと取引の URL
          が入ります。写真と正確な位置は入りません。写真を見たいときは、自分の依頼に限って
          <code className="mx-1 font-mono">GET /v1/verifications/{"{id}"}/evidence</code>
          で5分間だけ有効な URL を取れます。
        </p>
      </Section>

      <Section
        title="結果を待たずに受け取る（Webhook）"
        lead="送り先の URL は運営者が登録します。本文には ProofMarket-Signature ヘッダーで署名が付き、5分以上ずれたものは捨ててください。"
      >
        <ul className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((e) => (
            <li key={e} className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs">
              {e}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="上限と支払い">
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          API
          キーごとに、1件あたりの上限額と1日（日本時間）の上限額が決まっています。依頼を出すと、報酬×人数の額が前払いの残高から拘束され、確定すると
          worker に支払われます。期限切れや取り消しのときは残高に戻ります。試験運用中の残高は Solana Devnet
          のテスト用 USDC で、実際のお金は動きません。
        </p>
      </Section>
    </>
  );
}
