// S-03 開発者向け — connect over MCP or REST, the request fields, and how to read the result.
import { LIMITS, TASK_TYPE_ANSWERS, type TaskType, WEBHOOK_EVENTS } from "@proofmarket/core";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Code, PageHero, Section } from "@/components/site";
import { TASK_TYPE_JA } from "@/lib/answers";

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
  [
    "dispute_reality_verification",
    "結果に異議を出す。確定から24時間以内に1回だけ。同じ場所・同じ質問の再確認（既定は2人一致）を新しく作る",
  ],
];

const FIELDS: [string, string][] = [
  [
    "question",
    `確かめたいこと・してほしい作業。${LIMITS.question.maxChars}字まで。本なら書名・ページ・箇所まで書く`,
  ],
  [
    "type",
    (Object.keys(TASK_TYPE_JA) as TaskType[]).map((t) => `${t}（${TASK_TYPE_JA[t].name}）`).join("、") +
      "。API キーごとに使える種類を絞れる",
  ],
  [
    "answer_schema",
    `答えの形。type ごとに決まっている。選択式は { "type": "enum", "values": [...] }（${Object.entries(
      TASK_TYPE_ANSWERS,
    )
      .map(([t, v]) => `${t}: ${v?.join("・")}`)
      .join(
        "、",
      )} から2個以上。CUSTOM_CHOICE は自分で${LIMITS.answer.maxChoices}個まで決める）。数値は { "type": "number", "unit": "円" }（PRICE_CHECK・MEASUREMENT）。文章は { "type": "text", "max_chars": 2000 }（ほかの種類）。文章の答えは結果の answers に全員分が入り、answer にはその SHA-256 が入る`,
  ],
  [
    "location",
    `緯度・経度と半径（${LIMITS.radiusM.min}〜${LIMITS.radiusM.max}m）。現地で行う種類では必須。本・電話・実物の確認など、場所を問わない種類では省ける`,
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
  [
    "worker_requirements（任意）",
    '{ "min_tier": "standard" | "trusted" } で、引き受けられる worker を記録の良い人に絞る。trusted は有効な提出が10件以上で、複数人の依頼での一致率が90%以上の人',
  ],
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
      <PageHero eyebrow="開発者向け" title="エージェントが自分ではできない作業を、人に頼めるようにする">
        <p>
          店の様子を見に行く、紙の資料を書き起こす、実物を確かめる、電話で問い合わせる。MCP のツールを足すか
          REST API を呼べば、こうした作業を人に頼めます。人を探す、連絡する、支払うといった手間は ProofMarket
          が引き受けます。
        </p>
        <p className="mt-3">
          返ってくるのは答えだけではありません。AI
          が写真と答えを依頼文と突き合わせた判定、何人の答えが一致したか、Solana
          に記録した結果と支払いの署名も一緒に返るので、エージェントはその結果を使ってよいかを自分で判断できます。
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
            <a href="/console" className="ml-3 font-semibold text-teal-700 underline">
              依頼者の画面（履歴・残高）
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

      <Section
        title="登録なしで使う（x402）"
        lead="API キーがなくても、Solana のウォレットを持つエージェントなら依頼を出せます。依頼ごとに USDC を払う方式で、申し込みも契約も要りません。支払いの形式は x402（v2）の exact 方式に従っています。"
      >
        <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
          <li>
            依頼を
            <code className="mx-1 font-mono">POST /v1/x402/verifications</code>
            に送ります。中身は request.json と同じで、principal_ref は要りません。
          </li>
          <li>
            402 が返ります。PAYMENT-REQUIRED ヘッダーに、払う額（報酬×人数）、宛先、通貨（Devnet の
            USDC）、手数料を持つ側の公開鍵が入っています。中身に問題がある依頼は、払う前に 400
            などで断ります。
          </li>
          <li>
            指定どおりの USDC の送金取引を作り、自分の鍵で署名します。手数料は ProofMarket
            が持つので、ウォレットに SOL は要りません。
          </li>
          <li>
            同じ依頼を PAYMENT-SIGNATURE ヘッダー付きで送り直します。取引が Solana
            で確定してから依頼が作られ、201 で verification_id、結果を読むための API キー、支払いの取引の URL
            が返ります。
          </li>
        </ol>
        <div className="mt-4 space-y-3">
          <Code>{`# 1回目: 402 と支払い条件
curl -i -X POST ${base}/v1/x402/verifications \\
  -H "Content-Type: application/json" -d @request.json

# 2回目: 署名した取引を付けて送り直す
curl -X POST ${base}/v1/x402/verifications \\
  -H "Content-Type: application/json" -d @request.json \\
  -H "PAYMENT-SIGNATURE: <base64 の PaymentPayload>"`}</Code>
          <Code>{`# 見本のエージェント（リポジトリの scripts/）。402 の受け取りから結果待ちまで通しで動く
# 17 種類どれでも出せる。種類の一覧は --list-types、送らずに中身を見るなら --dry-run
A="pnpm --filter @proofmarket/scripts run run x402-agent.ts --base-url ${base}"

$A --type DOCUMENT_TRANSCRIPTION --question "届いた紙の請求書の合計金額の行を書き写してください"
$A --type PHONE_INQUIRY --question "この番号の病院に、今日の午後の外来の受付時間を聞いてください"
$A --type MEASUREMENT --unit cm --question "玄関のドアの幅を測ってください"
$A --type CUSTOM_CHOICE --choices "はい,いいえ" --question "この駅のエレベーターは今動いていますか"
$A --type PLACE_STATUS_VERIFICATION --lat 35.6595 --lng 139.7005`}</Code>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          同じ取引を2回送っても、依頼は1件しかできません。2回目は同じ verification_id を返し、API
          キーは付けません。1件の上限は 5 USDC です。テスト用の USDC は Circle の faucet（Solana
          Devnet）で受け取れます。
        </p>
      </Section>

      <Section
        title="結果を利用者に見せる（証明のリンク）"
        lead="エージェントが利用者に答えるとき、「AI の推測ではなく、人が確かめた事実だ」と示せます。"
      >
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          結果が出ると、<code className="font-mono">result.proof</code> に3つの値が入ります。
          <code className="font-mono">url</code> は公開の結果ページで、いつ・何人が・どう確かめたかと、Solana
          の記録を誰でも見られます。
          <code className="font-mono">badge_url</code> は答えと時刻を1行で示す画像、
          <code className="font-mono">markdown</code>{" "}
          はそのバッジをリンク付きで貼れる文字列です。質問文・写真・位置・文章の答えは、このページに出ません。
        </p>
        <div className="mt-4">
          <Code>{`"proof": {
  "url": "${base}/r/ver_01J9Z4K8...",
  "badge_url": "${base}/r/ver_01J9Z4K8.../badge.svg",
  "markdown": "[![人が確認](${base}/r/ver_01J9Z4K8.../badge.svg)](${base}/r/ver_01J9Z4K8...)"
}`}</Code>
        </div>
      </Section>

      <Section
        title="結果をみんなの地図に載せる"
        lead="公共の場所についての事実は、依頼した本人のほかにも役に立ちます。"
      >
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          依頼に <code className="font-mono">"publish": true</code> を付けると、結果が VERIFIED になったとき
          <Link href="/map" className="text-teal-700 underline">
            みんなの地図
          </Link>
          に72時間載ります。公開されるのは、質問文、指定した場所、答え、確かめた時刻と人数です。質問文に個人の事情を書いた依頼には付けないでください。場所のある依頼で、答えが選択か数値のものだけが対象で、それ以外は
          400 を返します。一覧は <code className="font-mono">GET /v1/public/map</code>{" "}
          でも読めるので、ほかのエージェントが依頼を出す前に調べる使い方もできます。
        </p>
      </Section>

      <Section title="MCP のツール（4つ）">
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
          で5分間だけ有効な URL を取れます。店舗が自分で「本日臨時休業」などと申告していれば、GET の
          store_report に参考として入ります。判定には使っていません。
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

      <Section
        title="結果に納得できないとき"
        lead="確定から24時間以内なら、1回だけ異議を出せます。同じ場所・同じ質問で、新しく再確認の依頼が作られます。費用はふつうの依頼と同じで、元の結果と支払いはそのまま残ります。"
      >
        <Code>{`curl -X POST ${base}/v1/verifications/ver_.../dispute \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "reason": "閉店の張り紙を見た", "assurance": { "level": "high" } }'`}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          返る recheck_verification_id をふつうの依頼と同じように読みます。元の依頼の GET には recheck
          が付き、再確認の答えが元と同じだったか（matches_original）が分かります。違ったときは運営者が元の提出を見直します。
        </p>
      </Section>

      <Section
        title="少し前の結果があれば、それを受け取る"
        lead="依頼に reuse を付けると、同じ店について少し前に確定した結果を探し、あれば人を出さずにその場で返します。待ち時間がなく、試験運用中は費用もかかりません。"
      >
        <Code>{`"reuse": { "max_age_seconds": 600 },   // 10分以内の結果があれば使う
"allow_reuse": true                     // 自分の結果をほかの依頼者に使わせてよい`}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          使われるのは、元の依頼者が allow_reuse
          を付けた結果だけです。店・種類・答えの選択肢が同じで、VERIFIED のものに限ります。見つかれば 200 で
          reused: true と結果そのものが返り、新しい依頼は作られません。NOTICE_POSTED
          は質問ごとに見る掲示が違うので対象外です。
        </p>
      </Section>

      <Section
        title="決まった時刻に繰り返し確かめる"
        lead="「平日の朝 9 時に、この店が開いているか」のような確認は、予定として登録できます。時刻が来るたびに通常の依頼が1件作られるので、残高や上限、確認の手順はふつうの依頼と同じです。"
      >
        <Code>{`curl -X POST ${base}/v1/schedules \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "request": { ...request.json から deadline を除いたもの },
    "deadline_minutes": 30,
    "times_jst": ["09:00"],
    "days_jst": [1, 2, 3, 4, 5]
  }'`}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          時刻は日本時間、曜日は 0 が日曜です。できた依頼は Webhook か GET /v1/schedules の
          last_verification_id で追えます。残高不足などで3回続けて作れなかった予定と、API
          キーが止められた予定は自動で止まります。止めるときは DELETE /v1/schedules/{"{id}"}{" "}
          を呼びます。1つのキーで動かせる予定は10件までです。
        </p>
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
