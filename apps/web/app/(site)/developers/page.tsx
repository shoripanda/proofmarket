// S-03 開発者向け — connect over MCP or REST, the request fields, and how to read the result.
import { LIMITS, TASK_TYPE_ANSWERS, type TaskType, WEBHOOK_EVENTS } from "@proofmarket/core";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Code, PageHero, Section } from "@/components/site";
import { taskTypeText } from "@/lib/answers";
import { type Lang, langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(lang, "開発者向け | ProofMarket", "Developers | ProofMarket"),
    description: pick(
      lang,
      "MCP・REST・x402 でエージェントをつなぎ、人が確かめた答えを受け取る。",
      "Connect Claude, ChatGPT or your own agent over MCP, REST or x402, and get verified real-world answers.",
    ),
  };
}
export const dynamic = "force-dynamic";

async function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "<your-app>"}`;
}

type Client = { name: string; checked: boolean; steps: string[]; note?: string };

const answerChoices = (sep: string) =>
  Object.entries(TASK_TYPE_ANSWERS)
    .map(([t, v]) => `${t}: ${v?.join(sep)}`)
    .join(", ");

const COPY = {
  ja: {
    eyebrow: "開発者向け",
    title: "エージェントが自分ではできない作業を、人に頼めるようにする",
    intro1:
      "店の様子を見に行く、紙の資料を書き起こす、実物を確かめる、電話で問い合わせる。MCP のツールを足すか REST API を呼べば、こうした作業を人に頼めます。人を探す、連絡する、支払うといった手間は ProofMarket が引き受けます。",
    intro2:
      "返ってくるのは答えだけではありません。AI が写真と答えを依頼文と突き合わせた判定、何人の答えが一致したか、Solana に記録した結果と支払いの署名も一緒に返るので、エージェントはその結果を使ってよいかを自分で判断できます。",
    ways: {
      title: "つなぎ方は3通りあります",
      lead: "どれを選んでも、使えるキーと上限は同じです。試験運用中は API キー（pm_test_ で始まる）を運営者が発行します。",
      applyKey: "API キーを申し込む",
      console: "依頼者の画面（履歴・残高）",
      remote: "claude.ai などのリモート MCP",
      remoteBody:
        "コネクタの追加画面にこの URL を入れます。接続のときに ProofMarket の画面が開くので、そこで API キーを入れます。キーがアプリ側に保存されることはありません。",
      local: "Claude Code などのローカルのエージェント",
      localBody: "同じ URL に、API キーをヘッダーで渡して登録します。",
      rest: "REST API",
      restBody:
        "依頼の作成には Idempotency-Key ヘッダーが要ります。同じキーで送り直しても、依頼は1件しかできません。",
    },
    clients: {
      title: "各 AI からつなぐ",
      lead: "同じ MCP の窓口に、それぞれのやり方でつなぎます。「確認済み」は、運営者がこの本番の窓口に実際につないで結果を読めたものです。",
      checked: "確認済み",
      unchecked: "手順のみ（未確認）",
      troubleBefore: "つながらないときは、画面に出た文言をそのまま",
      troubleLink: "申し込みフォーム",
      troubleAfter: "から送ってください。OAuth の窓口は ",
      troubleEnd: " で確かめられます。",
      items: [
        {
          name: "Claude Code",
          checked: true,
          steps: [
            'ターミナルで claude mcp add --transport http proofmarket <URL>/mcp --header "Authorization: Bearer <API キー>" を実行する',
            "claude を起動し、「ProofMarket の道具を一覧して」と頼む。4つ以上の道具が出れば接続できている",
          ],
          note: "キーをチャットに貼らない。--header の値はこの端末の設定にだけ残る",
        },
        {
          name: "claude.ai（ブラウザ・アプリ）",
          checked: true,
          steps: [
            "設定 → コネクタ → 「カスタムコネクタを追加」を開く",
            "名前に ProofMarket、URL に <URL>/mcp を入れて追加する",
            "「接続」を押すと ProofMarket の許可画面が開く。API キーを貼って許可する",
            "新しい会話で ProofMarket を有効にし、依頼を出す",
          ],
          note: "OAuth 2.1（動的クライアント登録・PKCE）で接続する。キーは ProofMarket 側にだけ渡る",
        },
        {
          name: "ChatGPT",
          checked: false,
          steps: [
            "設定 → アプリ → 詳細設定 で「開発者モード」をオンにする（Plus 以上）",
            "設定 → コネクタ → 「カスタムコネクタを追加」で URL に <URL>/mcp、認証に OAuth を選ぶ",
            "許可画面で API キーを貼る",
          ],
          note: "ChatGPT は動的クライアント登録に対応していて、ProofMarket 側もそれを出している",
        },
        {
          name: "Cursor・Windsurf などの MCP 対応エディタ",
          checked: false,
          steps: [
            'MCP の設定に { "url": "<URL>/mcp", "headers": { "Authorization": "Bearer <API キー>" } } の形で足す',
            "OAuth に対応したクライアントなら headers を省き、接続時に出る許可画面でキーを貼る",
          ],
        },
        {
          name: "自作のエージェント（REST・SDK）",
          checked: true,
          steps: [
            "Authorization: Bearer <API キー> を付けて REST API を呼ぶ。依頼の作成には Idempotency-Key が要る",
            "TypeScript なら packages/sdk の ProofMarketClient を使う。MCP サーバーもこの SDK の上に載っている",
          ],
        },
      ] as Client[],
    },
    x402: {
      title: "登録なしで使う（x402）",
      lead: "API キーがなくても、Solana のウォレットを持つエージェントなら依頼を出せます。依頼ごとに USDC を払う方式で、申し込みも契約も要りません。支払いの形式は x402（v2）の exact 方式に従っています。",
      steps: [
        [
          "依頼を",
          "POST /v1/x402/verifications",
          "に送ります。中身は request.json と同じで、principal_ref は要りません。",
        ],
        "402 が返ります。PAYMENT-REQUIRED ヘッダーに、払う額（報酬×人数）、宛先、通貨（Devnet の USDC）、手数料を持つ側の公開鍵が入っています。中身に問題がある依頼は、払う前に 400 などで断ります。",
        "指定どおりの USDC の送金取引を作り、自分の鍵で署名します。手数料は ProofMarket が持つので、ウォレットに SOL は要りません。",
        "同じ依頼を PAYMENT-SIGNATURE ヘッダー付きで送り直します。取引が Solana で確定してから依頼が作られ、201 で verification_id、結果を読むための API キー、支払いの取引の URL が返ります。",
      ] as (string | [string, string, string])[],
      code1: `# 1回目: 402 と支払い条件`,
      code2: `# 2回目: 署名した取引を付けて送り直す`,
      code3a: "# 見本のエージェント（リポジトリの scripts/）。402 の受け取りから結果待ちまで通しで動く",
      code3b: "# 17 種類どれでも出せる。種類の一覧は --list-types、送らずに中身を見るなら --dry-run",
      samples: [
        `--type DOCUMENT_TRANSCRIPTION --question "届いた紙の請求書の合計金額の行を書き写してください"`,
        `--type PHONE_INQUIRY --question "この番号の病院に、今日の午後の外来の受付時間を聞いてください"`,
        `--type MEASUREMENT --unit cm --question "玄関のドアの幅を測ってください"`,
        `--type CUSTOM_CHOICE --choices "はい,いいえ" --question "この駅のエレベーターは今動いていますか"`,
        `--type PLACE_STATUS_VERIFICATION --lat 35.6595 --lng 139.7005`,
      ],
      note: "同じ取引を2回送っても、依頼は1件しかできません。2回目は同じ verification_id を返し、API キーは付けません。1件の上限は 5 USDC です。テスト用の USDC は Circle の faucet（Solana Devnet）で受け取れます。",
    },
    proof: {
      title: "結果を利用者に見せる（証明のリンク）",
      lead: "エージェントが利用者に答えるとき、「AI の推測ではなく、人が確かめた事実だ」と示せます。",
      p: [
        "結果が出ると、",
        " に3つの値が入ります。",
        " は公開の結果ページで、いつ・何人が・どう確かめたかと、Solana の記録を誰でも見られます。",
        " は答えと時刻を1行で示す画像、",
        " はそのバッジをリンク付きで貼れる文字列です。質問文・写真・位置・文章の答えは、このページに出ません。",
      ],
      badgeAlt: "人が確認",
    },
    map: {
      title: "結果をみんなの地図に載せる",
      lead: "公共の場所についての事実は、依頼した本人のほかにも役に立ちます。",
      p1: "依頼に ",
      p2: " を付けると、結果が VERIFIED になったとき",
      link: "みんなの地図",
      p3: "に72時間載ります。公開されるのは、質問文、指定した場所、答え、確かめた時刻と人数です。質問文に個人の事情を書いた依頼には付けないでください。場所のある依頼で、答えが選択か数値のものだけが対象で、それ以外は 400 を返します。一覧は ",
      p4: " でも読めるので、ほかのエージェントが依頼を出す前に調べる使い方もできます。",
    },
    tools: {
      title: "MCP のツール（8つ）",
      items: [
        ["request_reality_verification", "質問を出す。verification_id がすぐ返り、結果は後から読む"],
        [
          "request_reality_verifications_batch",
          "同じ依頼を多くの場所へ、または違う質問を一度に。最大50件。全件できるか、1件も作らないか",
        ],
        ["get_reality_verification", "状態と結果を読む。wait_seconds（最大20秒）で変化を待てる"],
        ["cancel_reality_verification", "まだ誰も向かっていない依頼を取り消す。拘束した額は残高に戻る"],
        [
          "dispute_reality_verification",
          "結果に異議を出す。確定から24時間以内に1回だけ。同じ場所・同じ質問の再確認（既定は2人一致）を新しく作る",
        ],
        [
          "watch_reality_verification",
          "見守りを始める。望む答えが返るまで決めた間隔で確かめ続け、合ったら止まる。回数の上限も付けられる",
        ],
        [
          "list_reality_verification_watches",
          "見守りと定期確認の一覧。止まった理由と、条件に合った依頼の ID が分かる",
        ],
        ["stop_reality_verification_watch", "見守りや定期確認を止める。すでに作られた依頼はそのまま進む"],
      ] as [string, string][],
      note: "人が現地まで行くので、結果が出るまでふつう10〜60分かかります。状態が VERIFIED・REJECTED・EXPIRED のどれかになるまで、エージェントに答えを推測させないでください。",
    },
    fields: {
      title: "依頼の中身",
      lead: "request.json の例です。principal_ref は API キーと一緒に渡される ID です。",
      question: "この店はいま営業していますか？",
      items: (types: Record<TaskType, { name: string }>) =>
        [
          [
            "question",
            `確かめたいこと・してほしい作業。${LIMITS.question.maxChars}字まで。本なら書名・ページ・箇所まで書く`,
          ],
          [
            "type",
            `${(Object.keys(types) as TaskType[]).map((t) => `${t}（${types[t].name}）`).join("、")}。API キーごとに使える種類を絞れる`,
          ],
          [
            "answer_schema",
            `答えの形。type ごとに決まっている。選択式は { "type": "enum", "values": [...] }（${answerChoices("・")} から2個以上。CUSTOM_CHOICE は自分で${LIMITS.answer.maxChoices}個まで決める）。数値は { "type": "number", "unit": "円" }（PRICE_CHECK・MEASUREMENT）。文章は { "type": "text", "max_chars": 2000 }（ほかの種類）。文章の種類では、複数の項目をまとめて受け取る { "type": "form", "fields": [{ "key": "price", "label": "値段", "type": "number", "unit": "円" }, ...] } も使える（${LIMITS.answer.maxFormFields}項目まで。答えは項目ごとの値を持つ JSON が 1 人 1 つ）。文章と form の答えは結果の answers に全員分が入り、answer にはその SHA-256 が入る。form の項目には尺度 { "type": "scale", "key": "noise", "label": "騒音", "max": 5, "labels": ["静か", "うるさい"] } も使える（max は 5 か 10。worker には丸が横に並び、言葉は両端だけに出る。3 人以上の答えがそろうと、結果の aggregate に項目ごとの中央値・最小・最大が入る）`,
          ],
          [
            "acceptance_criteria",
            `受け取りの条件（任意、${LIMITS.acceptanceCriteria.maxChars}字まで）。「値札の数字が読める写真であること」「店名が写っていること」のように書く。worker には質問文の下に出て、AI の照合にも質問文と一緒に渡る`,
          ],
          [
            "attestation",
            `エージェント自身がしたことを、人に確かめてもらう（任意）。{ "subject": "agent_action", "description": "302号室に荷物を届けた" } のように書く（description は${LIMITS.attestation.maxDescriptionChars}字まで）。worker には「AI エージェントが『…』と言っています」と出て、証明ページの見出しは「『…』が本当だと、人が確かめました」になる。検査と判定はふつうの依頼と同じ`,
          ],
          [
            "location",
            `緯度・経度と半径（${LIMITS.radiusM.min}〜${LIMITS.radiusM.max}m）。現地で行う種類では必須。本・電話・実物の確認など、場所を問わない種類では省ける`,
          ],
          [
            "deadline",
            `締め切り。今から${LIMITS.deadlineFromNow.minMinutes}分後〜${LIMITS.deadlineFromNow.maxHours}時間後。場所を省いた依頼は${LIMITS.deadlineFromNow.maxHoursAnywhere / 24}日後まで`,
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
            "bounty.max_amount・ramp_minutes（任意）",
            "報酬の上限と、上がりきるまでの分数（10〜1440、既定は締切まで）。報酬は amount から直線で上がり、最初に誰かが引き受けた時点の額で全員分が決まる。作成時に max_amount × 人数を引き当て、使わない分はその時点で残高に戻る。x402 では使えない",
          ],
          [
            "worker_requirements（任意）",
            '{ "min_tier": "standard" | "trusted" } で、引き受けられる worker を記録の良い人に絞る。trusted は有効な提出が10件以上で、複数人の依頼での一致率が90%以上の人',
          ],
        ] as [string, string][],
    },
    outcomes: {
      title: "結果の読み方",
      lead: "status が次の3つのどれかになったら確定です。確定までの途中の状態（OPEN、CLAIMED など）では result は null です。",
      items: [
        ["VERIFIED", "quorum 以上の答えがそろった。answer に答えが入る"],
        ["REJECTED", "答えが割れた（NO_CONSENSUS）か、有効な証言が足りなかった"],
        ["EXPIRED", "締め切りまでに確定しなかった。拘束した額は返金される"],
      ] as [string, string][],
      p1: "result には答えのほかに、有効な証言の数、一致率、場所・鮮度・写真の使い回しなどの確認結果、Solana に記録した証拠のハッシュと取引の URL が入ります。写真と正確な位置は入りません。写真を見たいときは、自分の依頼に限って",
      p2: "で5分間だけ有効な URL を取れます。店舗が自分で「本日臨時休業」などと申告していれば、GET の store_report に参考として入ります。判定には使っていません。",
    },
    webhook: {
      title: "結果を待たずに受け取る（Webhook）",
      lead: "送り先の URL は運営者が登録します。本文には ProofMarket-Signature ヘッダーで署名が付き、5分以上ずれたものは捨ててください。",
    },
    dispute: {
      title: "結果に納得できないとき",
      lead: "確定から24時間以内なら、1回だけ異議を出せます。同じ場所・同じ質問で、新しく再確認の依頼が作られます。費用はふつうの依頼と同じで、元の結果と支払いはそのまま残ります。",
      reason: "閉店の張り紙を見た",
      p: "返る recheck_verification_id をふつうの依頼と同じように読みます。元の依頼の GET には recheck が付き、再確認の答えが元と同じだったか（matches_original）が分かります。違ったときは運営者が元の提出を見直します。",
    },
    reuse: {
      title: "少し前の結果があれば、それを受け取る",
      lead: "依頼に reuse を付けると、同じ店について少し前に確定した結果を探し、あれば人を出さずにその場で返します。待ち時間がなく、試験運用中は費用もかかりません。",
      code: `"reuse": { "max_age_seconds": 600 },   // 10分以内の結果があれば使う
"allow_reuse": true                     // 自分の結果をほかの依頼者に使わせてよい`,
      p: "使われるのは、元の依頼者が allow_reuse を付けた結果だけです。店・種類・答えの選択肢が同じで、VERIFIED のものに限ります。見つかれば 200 で reused: true と結果そのものが返り、新しい依頼は作られません。NOTICE_POSTED は質問ごとに見る掲示が違うので対象外です。",
    },
    batch: {
      title: "同じ依頼を、多くの場所へ一度に",
      lead: "棚の確認を50店舗へ、同じ値段の質問を街じゅうへ、1つの場所に違う質問をいくつも。1回の呼び出しで最大50件の依頼を作れます。",
      code: `POST /v1/verifications/batch      // Idempotency-Key は1つ
{
  "template": { ...request.json から question と location を除いたもの },
  "items": [
    { "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 }, "question": "A店に○○はあるか" },
    { "location": { "lat": 35.6600, "lng": 139.7000, "radius_m": 80 }, "question": "B店に○○はあるか" }
  ]
}`,
      p: "件ごとに template と重ねて、ふつうの依頼と同じ検査を順に行います。1件でも通らなければ全体を断り、何も作りません（details.index に何件目かが入ります）。残高と1日の上限は合計で見ます。応答の verifications は items の順で、それぞれ別の verification_id として追えます。MCP では request_reality_verifications_batch が同じことをします。",
    },
    senses: {
      title: "店の雰囲気を 3 人で測る",
      lead: "匂い・騒音・清潔感・明るさのように、写真だけでは伝わらない感覚も頼めます。3 人に、1〜5 の尺度で答えてもらいます。",
      code: `{
  "type": "SITE_REPORT",
  "question": "カフェ○○の店内の雰囲気を、4 つの尺度で答えてください",
  "answer_schema": { "type": "form", "fields": [
    { "type": "scale", "key": "smell", "label": "匂い",   "max": 5, "labels": ["気にならない", "強い"] },
    { "type": "scale", "key": "noise", "label": "騒音",   "max": 5, "labels": ["静か", "うるさい"] },
    { "type": "scale", "key": "clean", "label": "清潔感", "max": 5, "labels": ["汚れている", "きれい"] },
    { "type": "scale", "key": "light", "label": "明るさ", "max": 5, "labels": ["暗い", "明るい"] }
  ] },
  "acceptance_criteria": "店内の様子が分かる写真であること。人の顔は大きく写さないこと",
  "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
  "assurance": { "level": "high" },
  ...残りは request.json と同じ
}`,
      p: "3 人の答えがそろうと、result.aggregate に尺度ごとの { median, min, max, n } が入ります。人数が偶数のときの中央値は小さい方を取るので、整数のままです。多数決はしません。判定は文章の答えと同じです。aggregate は result_hash に含まれます。",
    },
    schedule: {
      title: "決まった時刻に繰り返し確かめる",
      lead: "「平日の朝 9 時に、この店が開いているか」のような確認は、予定として登録できます。時刻が来るたびに通常の依頼が1件作られるので、残高や上限、確認の手順はふつうの依頼と同じです。",
      codeRequest: "...request.json から deadline を除いたもの",
      p: "時刻は日本時間、曜日は 0 が日曜です。できた依頼は Webhook か GET /v1/schedules の last_verification_id で追えます。残高不足などで3回続けて作れなかった予定と、API キーが止められた予定は自動で止まります。止めるときは DELETE /v1/schedules/{id} を呼びます。1つのキーで動かせる予定は10件までです。",
    },
    watch: {
      title: "望む答えが返るまで見守る",
      lead: "「エレベーターが復旧したら知らせて」「棚に入荷したら知らせて」のような依頼は、見守りとして登録できます。決めた間隔で確かめ続け、条件に合う答えが確定したら止まります。",
      codeRequest: "...STOCK_CHECK の依頼。deadline は除く",
      c1: "// 2時間おき。最初の1回はすぐ",
      c2: "// 多くても12回で止まる",
      c3: "// この答えが確定したら止まる",
      p: [
        "1回ごとに通常の依頼が作られ、そのぶんだけ払います。条件は、選択で答える依頼なら ",
        " か ",
        "、数値で答える依頼なら ",
        " のように書きます。文章で答える依頼には付けられません。条件に合うと、その依頼の verification.verified の Webhook が届き、GET /v1/schedules の stopped_reason が condition_met、matched_verification_id に合った依頼の ID が入ります。MCP では watch_reality_verification で同じことができます。",
      ],
    },
    limits: {
      title: "上限と支払い",
      p: "API キーごとに、1件あたりの上限額と1日（日本時間）の上限額が決まっています。依頼を出すと、報酬×人数の額が前払いの残高から拘束され、確定すると worker に支払われます。期限切れや取り消しのときは残高に戻ります。試験運用中の残高は Solana Devnet のテスト用 USDC で、実際のお金は動きません。",
    },
  },
  en: {
    eyebrow: "Developers",
    title: "Let your agent hand off what it cannot do itself to a person",
    intro1:
      "Go and look at a shop, transcribe a paper document, inspect a physical item, phone and ask. Add the MCP tools or call the REST API and your agent can ask a person to do these things. Finding, contacting and paying people is ProofMarket's job.",
    intro2:
      "You get more than an answer: the AI's verdict on whether the photo and answer match the request, how many people agreed, and the Solana signature of the recorded result and payout, so the agent can decide for itself whether to rely on the result.",
    ways: {
      title: "Three ways in",
      lead: "Whichever you choose, the keys and the limits are the same. During the pilot, API keys (starting with pm_test_) are issued by the operator.",
      applyKey: "Request an API key",
      console: "Requester console (history, balance)",
      remote: "Remote MCP from claude.ai and similar",
      remoteBody:
        "Enter this URL where the app adds a connector. On connecting, a ProofMarket page opens where you paste the API key. The key is never stored on the app's side.",
      local: "Local agents such as Claude Code",
      localBody: "Register the same URL, passing the API key in a header.",
      rest: "REST API",
      restBody:
        "Creating a request needs an Idempotency-Key header. Resending with the same key never creates a second request.",
    },
    clients: {
      title: "Connecting from each AI",
      lead: "Each client connects to the same MCP endpoint in its own way. “Verified” means the operator actually connected it to this production endpoint and read results.",
      checked: "Verified",
      unchecked: "Steps only (not verified)",
      troubleBefore: "If it will not connect, send the exact message you saw through the ",
      troubleLink: "application form",
      troubleAfter: ". The OAuth endpoint can be inspected at ",
      troubleEnd: ".",
      items: [
        {
          name: "Claude Code",
          checked: true,
          steps: [
            'In a terminal, run claude mcp add --transport http proofmarket <URL>/mcp --header "Authorization: Bearer <API key>"',
            "Start claude and ask it to list ProofMarket's tools. Four or more tools means you are connected",
          ],
          note: "Never paste the key into the chat. The --header value stays in this machine's settings only",
        },
        {
          name: "claude.ai (browser and apps)",
          checked: true,
          steps: [
            "Open Settings → Connectors → “Add custom connector”",
            "Enter ProofMarket as the name and <URL>/mcp as the URL, then add it",
            "Press “Connect”; ProofMarket's consent page opens. Paste the API key and allow",
            "Enable ProofMarket in a new conversation and send a request",
          ],
          note: "Connects over OAuth 2.1 (dynamic client registration, PKCE). The key goes to ProofMarket only",
        },
        {
          name: "ChatGPT",
          checked: false,
          steps: [
            "Turn on Developer mode under Settings → Apps → Advanced (Plus or above)",
            "Settings → Connectors → “Add custom connector”: URL <URL>/mcp, authentication OAuth",
            "Paste the API key on the consent page",
          ],
          note: "ChatGPT supports dynamic client registration, which ProofMarket advertises",
        },
        {
          name: "Cursor, Windsurf and other MCP-capable editors",
          checked: false,
          steps: [
            'Add { "url": "<URL>/mcp", "headers": { "Authorization": "Bearer <API key>" } } to the MCP settings',
            "With an OAuth-capable client, leave out headers and paste the key on the consent page that opens on connect",
          ],
        },
        {
          name: "Your own agent (REST, SDK)",
          checked: true,
          steps: [
            "Call the REST API with Authorization: Bearer <API key>. Creating a request needs an Idempotency-Key",
            "In TypeScript, use ProofMarketClient from packages/sdk. The MCP server itself is built on this SDK",
          ],
        },
      ] as Client[],
    },
    x402: {
      title: "No sign-up: x402",
      lead: "Any agent with a Solana wallet can send requests without an API key, paying in USDC per request, with no application and no contract. Payments follow the exact scheme of x402 (v2).",
      steps: [
        [
          "Send the request to ",
          "POST /v1/x402/verifications",
          ". The body is the same as request.json; principal_ref is not needed.",
        ],
        "You get a 402. The PAYMENT-REQUIRED header carries the amount (bounty × people), the destination, the asset (USDC on Devnet) and the fee payer's public key. A request with a bad body is refused with 400 or similar before any payment.",
        "Build the USDC transfer exactly as specified and sign it with your key. ProofMarket pays the network fee, so the wallet needs no SOL.",
        "Resend the same request with a PAYMENT-SIGNATURE header. Once the transaction is confirmed on Solana the request is created, and a 201 returns the verification_id, an API key for reading the result, and the Explorer URL of the payment.",
      ] as (string | [string, string, string])[],
      code1: "# 1st call: 402 with the payment terms",
      code2: "# 2nd call: resend with the signed transaction",
      code3a:
        "# Sample agent (scripts/ in the repository). Runs end to end, from the 402 to waiting for the result",
      code3b: "# Any of the 17 types. --list-types lists them; --dry-run shows the body without sending",
      samples: [
        `--type DOCUMENT_TRANSCRIPTION --question "Copy the total line of the paper invoice you received"`,
        `--type PHONE_INQUIRY --question "Call this clinic and ask for this afternoon's outpatient hours"`,
        `--type MEASUREMENT --unit cm --question "Measure the width of the front door"`,
        `--type CUSTOM_CHOICE --choices "yes,no" --question "Is the lift at this station running right now?"`,
        `--type PLACE_STATUS_VERIFICATION --lat 35.6595 --lng 139.7005`,
      ],
      note: "Sending the same transaction twice never creates two requests: the second call returns the same verification_id without an API key. The cap is 5 USDC per request. Test USDC is available from Circle's faucet (Solana Devnet).",
    },
    proof: {
      title: "Show the result to your user (proof link)",
      lead: "When the agent answers its user, it can show that this is a fact a person checked, not an AI guess.",
      p: [
        "When a result is ready, ",
        " holds three values. ",
        " is the public result page, where anyone can see when, by how many people and how it was checked, along with the Solana record. ",
        " is an image showing the answer and the time in one line, and ",
        " is a ready-made string that embeds the badge with the link. The question, photos, location and text answers never appear on that page.",
      ],
      badgeAlt: "Human-verified",
    },
    map: {
      title: "Put a result on the public map",
      lead: "A fact about a public place helps more people than the one who asked.",
      p1: "Add ",
      p2: " to a request and, once the result is VERIFIED, it appears on the ",
      link: "public map",
      p3: " for 72 hours. What is published: the question, the place named in the request, the answer, the time and the number of people. Do not set it on requests whose question contains personal circumstances. Only requests with a place and a multiple-choice or numeric answer qualify; anything else returns 400. The list is also available at ",
      p4: ", so other agents can look before they ask.",
    },
    tools: {
      title: "MCP tools (8)",
      items: [
        ["request_reality_verification", "Ask. Returns a verification_id at once; read the result later"],
        [
          "request_reality_verifications_batch",
          "The same request at many places, or many questions at once. Up to 50 items; all are created or none is",
        ],
        ["get_reality_verification", "Read the state and result. wait_seconds (up to 20) waits for a change"],
        [
          "cancel_reality_verification",
          "Cancel a request nobody has set off for. The reserved amount returns to the balance",
        ],
        [
          "dispute_reality_verification",
          "Dispute a result: once, within 24 hours of it becoming final. Creates a recheck of the same place and question (two agreeing witnesses by default)",
        ],
        [
          "watch_reality_verification",
          "Start a watch: keep checking at an interval until the answer you want comes back, then stop. A run limit can be set",
        ],
        [
          "list_reality_verification_watches",
          "List watches and schedules, with why each stopped and the ID of the request that matched",
        ],
        ["stop_reality_verification_watch", "Stop a watch or schedule. Requests already created keep going"],
      ] as [string, string][],
      note: "A person has to go there, so a result usually takes 10 to 60 minutes. Do not let the agent guess an answer before the status is VERIFIED, REJECTED or EXPIRED.",
    },
    fields: {
      title: "Inside a request",
      lead: "An example request.json. principal_ref is the ID handed out with the API key.",
      question: "Is this shop open right now?",
      items: (types: Record<TaskType, { name: string }>) =>
        [
          [
            "question",
            `What to check or do. Up to ${LIMITS.question.maxChars} characters. For a book, give the title, page and passage`,
          ],
          [
            "type",
            `${(Object.keys(types) as TaskType[]).map((t) => `${t} (${types[t].name})`).join(", ")}. The types available can be restricted per API key`,
          ],
          [
            "answer_schema",
            `The shape of the answer, fixed per type. Multiple choice: { "type": "enum", "values": [...] } (two or more of ${answerChoices(" / ")}; CUSTOM_CHOICE lets you define up to ${LIMITS.answer.maxChoices} of your own). Number: { "type": "number", "unit": "JPY" } (PRICE_CHECK, MEASUREMENT). Text: { "type": "text", "max_chars": 2000 } (the other types). Text types also take a form, several named fields in one answer: { "type": "form", "fields": [{ "key": "price", "label": "Price", "type": "number", "unit": "JPY" }, ...] } (up to ${LIMITS.answer.maxFormFields} fields; each witness returns one JSON object). Text and form answers from every witness go into the result's answers, and answer holds their SHA-256. A form field can also be a scale: { "type": "scale", "key": "noise", "label": "Noise", "max": 5, "labels": ["quiet", "loud"] } (max is 5 or 10; the worker sees a row of circles with words only at the ends; once 3 or more answers are in, the result's aggregate gives the median, min and max per field)`,
          ],
          [
            "acceptance_criteria",
            `What you will accept (optional, up to ${LIMITS.acceptanceCriteria.maxChars} characters), such as "the price tag must be legible" or "the shop name must be in the photo". Shown to the worker under the question and given to the AI review alongside it`,
          ],
          [
            "attestation",
            `Have a person confirm something the agent itself did (optional): { "subject": "agent_action", "description": "Delivered the parcel to room 302" } (description up to ${LIMITS.attestation.maxDescriptionChars} characters). The worker sees "An AI agent says '…'", and the proof page headline reads "A person confirmed: “…”". Checks and judgement are the same as any request`,
          ],
          [
            "location",
            `Latitude, longitude and radius (${LIMITS.radiusM.min}–${LIMITS.radiusM.max} m). Required for on-site types; optional for types that need no place, such as books, phone calls and physical items`,
          ],
          [
            "deadline",
            `Between ${LIMITS.deadlineFromNow.minMinutes} minutes and ${LIMITS.deadlineFromNow.maxHours} hours from now; up to ${LIMITS.deadlineFromNow.maxHoursAnywhere / 24} days for a request with no location`,
          ],
          [
            "freshness.max_age_seconds",
            `How many seconds after capture a photo still counts. ${LIMITS.freshnessMaxAgeS.min}–${LIMITS.freshnessMaxAgeS.max} s, default ${LIMITS.freshnessMaxAgeS.default} s`,
          ],
          [
            "assurance",
            `How many people should check (required_witnesses, up to ${LIMITS.witnesses.max}) and how many must agree (quorum). { "level": "fast" | "standard" | "high" } means one person, two agreeing, or two of three`,
          ],
          ["bounty", "Per person. Test USDC on Solana Devnet during the pilot"],
          [
            "bounty.max_amount / ramp_minutes (optional)",
            "A ceiling for the reward and the minutes it takes to get there (10-1440, default: until the deadline). The reward climbs in a straight line from amount, and the amount when the first person claims is what everyone is paid. max_amount × people is reserved at creation; the unused part returns to the balance at that moment. Not available over x402",
          ],
          [
            "worker_requirements (optional)",
            '{ "min_tier": "standard" | "trusted" } restricts who may claim to workers with a good record. trusted means 10 or more valid submissions and at least 90% agreement on multi-person requests',
          ],
        ] as [string, string][],
    },
    outcomes: {
      title: "Reading the result",
      lead: "The result is final when status is one of these three. In the states before that (OPEN, CLAIMED and so on) result is null.",
      items: [
        ["VERIFIED", "Enough answers agreed to meet the quorum. answer holds the answer"],
        ["REJECTED", "Answers were split (NO_CONSENSUS) or there were too few valid witnesses"],
        ["EXPIRED", "Not final by the deadline. The reserved amount is refunded"],
      ] as [string, string][],
      p1: "Besides the answer, result carries the number of valid witnesses, the agreement ratio, the outcome of each check (place, freshness, photo reuse and so on), the evidence hash recorded on Solana and the transaction URL. Photos and exact positions are not included. To see the photos of your own requests, call",
      p2: "for a URL valid for 5 minutes. If the shop itself has reported “closed today” or similar, it appears in store_report on the GET for reference; it plays no part in the verdict.",
    },
    webhook: {
      title: "Receive results without polling (webhooks)",
      lead: "The operator registers the destination URL. Bodies are signed in the ProofMarket-Signature header; discard anything more than 5 minutes out of time.",
    },
    dispute: {
      title: "Disputing a result",
      lead: "Within 24 hours of a result becoming final, you can dispute it once. A new recheck request is created for the same place and question. It costs the same as a normal request, and the original result and payout stand.",
      reason: "I saw a closure notice on the door",
      p: "Read the returned recheck_verification_id like any request. The GET for the original request gains a recheck field showing whether the recheck's answer matched (matches_original). When it does not, the operator reviews the original submissions.",
    },
    reuse: {
      title: "Reuse a recent result",
      lead: "Add reuse to a request and ProofMarket looks for a recent final result about the same shop. If there is one, it is returned on the spot without sending anyone, with no wait and, during the pilot, no cost.",
      code: `"reuse": { "max_age_seconds": 600 },   // use a result from the last 10 minutes if there is one
"allow_reuse": true                     // let other requesters reuse my result`,
      p: "Only results whose original requester set allow_reuse are used, and only VERIFIED ones for the same shop, type and answer choices. When one is found, a 200 returns reused: true and the result itself, and no new request is created. NOTICE_POSTED is excluded, since each question looks at a different notice.",
    },
    batch: {
      title: "The same request at many places, at once",
      lead: "A shelf check at 50 shops, the same price question across a city, several different questions about one site. One call creates up to 50 requests.",
      code: `POST /v1/verifications/batch      // one Idempotency-Key for the batch
{
  "template": { ...request.json without question and location },
  "items": [
    { "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 }, "question": "Does shop A stock X?" },
    { "location": { "lat": 35.6600, "lng": 139.7000, "radius_m": 80 }, "question": "Does shop B stock X?" }
  ]
}`,
      p: "Each item is laid over the template and checked exactly like a single request. If any item fails, the whole batch is refused and nothing is created (details.index names the item). Balance and the daily limit are checked on the total. verifications in the response follow the order of items; each is its own verification_id. Over MCP, request_reality_verifications_batch does the same.",
    },
    senses: {
      title: "Measure the feel of a shop with 3 people",
      lead: "Smell, noise, cleanliness, brightness: senses a photo cannot carry. Three people each answer on a scale of 1 to 5.",
      code: `{
  "type": "SITE_REPORT",
  "question": "How does the inside of cafe X feel? Answer on the four scales",
  "answer_schema": { "type": "form", "fields": [
    { "type": "scale", "key": "smell", "label": "Smell",       "max": 5, "labels": ["none", "strong"] },
    { "type": "scale", "key": "noise", "label": "Noise",       "max": 5, "labels": ["quiet", "loud"] },
    { "type": "scale", "key": "clean", "label": "Cleanliness", "max": 5, "labels": ["dirty", "spotless"] },
    { "type": "scale", "key": "light", "label": "Brightness",  "max": 5, "labels": ["dark", "bright"] }
  ] },
  "acceptance_criteria": "The photo shows the inside of the shop, with no faces in close-up",
  "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
  "assurance": { "level": "high" },
  ...the rest as in request.json
}`,
      p: "Once all 3 answers are in, result.aggregate holds { median, min, max, n } per scale. With an even count the median is the lower middle value, so it stays a whole number. There is no vote: the outcome is decided as for text answers. aggregate is part of result_hash.",
    },
    schedule: {
      title: "Check again at set times",
      lead: "A check such as “is this shop open at 9 on weekday mornings” can be registered as a schedule. Each time it fires, one normal request is created, so balance, limits and checks work exactly as usual.",
      codeRequest: "...request.json without deadline",
      p: "Times are Japan time; days run from 0 (Sunday). Follow the created requests through webhooks or last_verification_id on GET /v1/schedules. A schedule that fails to create a request three times in a row (insufficient balance, say), or whose API key is suspended, stops by itself. Stop one with DELETE /v1/schedules/{id}. Up to 10 schedules per key.",
    },
    watch: {
      title: "Watch until the answer you want comes back",
      lead: "“Tell me when the lift is working again”, “tell me when it's back in stock”: register these as watches. ProofMarket keeps checking at the interval you set and stops once a matching answer is final.",
      codeRequest: "...a STOCK_CHECK request without deadline",
      c1: "// every 2 hours; the first run is immediate",
      c2: "// stop after at most 12 runs",
      c3: "// stop once this answer is final",
      p: [
        "Each run creates a normal request and is paid for as one. For multiple-choice requests the condition is ",
        " or ",
        "; for numeric requests, something like ",
        ". Text requests cannot take a condition. When it matches, that request's verification.verified webhook arrives, stopped_reason on GET /v1/schedules reads condition_met, and matched_verification_id holds the matching request's ID. Over MCP, watch_reality_verification does the same.",
      ],
    },
    limits: {
      title: "Limits and payment",
      p: "Each API key has a per-request limit and a daily (Japan time) limit. When a request is made, bounty × people is reserved from the prepaid balance and paid to the workers once the result is final. On expiry or cancellation it returns to the balance. During the pilot the balance is test USDC on Solana Devnet; no real money moves.",
    },
  },
} satisfies Record<Lang, unknown>;

export default async function DevelopersPage() {
  const lang = await getLang();
  const c = COPY[lang];
  const base = await baseUrl();
  const h = (p: string) => langHref(lang, p);
  const types = taskTypeText(lang);
  const createBody = `{
  "type": "PLACE_STATUS_VERIFICATION",
  "question": "${c.fields.question}",
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
      <PageHero eyebrow={c.eyebrow} title={c.title}>
        <p>{c.intro1}</p>
        <p className="mt-3">{c.intro2}</p>
      </PageHero>

      <Section
        title={c.ways.title}
        lead={
          <>
            {c.ways.lead}
            <a href={h("/join?role=requester")} className="ml-1 font-semibold text-teal-700 underline">
              {c.ways.applyKey}
            </a>
            <a href={h("/console")} className="ml-3 font-semibold text-teal-700 underline">
              {c.ways.console}
            </a>
          </>
        }
      >
        <div className="space-y-8">
          <div>
            <h3 className="font-bold">{c.ways.remote}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.ways.remoteBody}</p>
            <div className="mt-3">
              <Code>{`${base}/mcp`}</Code>
            </div>
          </div>
          <div>
            <h3 className="font-bold">{c.ways.local}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.ways.localBody}</p>
            <div className="mt-3">
              <Code>{`claude mcp add --transport http proofmarket ${base}/mcp \\
  --header "Authorization: Bearer pm_test_..."`}</Code>
            </div>
          </div>
          <div>
            <h3 className="font-bold">{c.ways.rest}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.ways.restBody}</p>
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

      <Section title={c.clients.title} lead={c.clients.lead}>
        <ul className="grid gap-4 md:grid-cols-2">
          {c.clients.items.map((cl) => (
            <li key={cl.name} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">{cl.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${cl.checked ? "bg-teal-50 text-teal-800 ring-1 ring-teal-600" : "bg-slate-100 text-slate-600"}`}
                >
                  {cl.checked ? c.clients.checked : c.clients.unchecked}
                </span>
              </div>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
                {cl.steps.map((s) => (
                  <li key={s}>{s.replaceAll("<URL>", base)}</li>
                ))}
              </ol>
              {cl.note ? <p className="mt-2 text-xs leading-relaxed text-slate-500">{cl.note}</p> : null}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          {c.clients.troubleBefore}
          <a href={h("/join?role=requester")} className="mx-1 text-teal-700 underline">
            {c.clients.troubleLink}
          </a>
          {c.clients.troubleAfter}
          <code className="font-mono">{base}/.well-known/oauth-authorization-server</code>
          {c.clients.troubleEnd}
        </p>
      </Section>

      <Section title={c.x402.title} lead={c.x402.lead}>
        <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
          {c.x402.steps.map((s, i) =>
            typeof s === "string" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
              <li key={i}>{s}</li>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
              <li key={i}>
                {s[0]}
                <code className="mx-1 font-mono">{s[1]}</code>
                {s[2]}
              </li>
            ),
          )}
        </ol>
        <div className="mt-4 space-y-3">
          <Code>{`${c.x402.code1}
curl -i -X POST ${base}/v1/x402/verifications \\
  -H "Content-Type: application/json" -d @request.json

${c.x402.code2}
curl -X POST ${base}/v1/x402/verifications \\
  -H "Content-Type: application/json" -d @request.json \\
  -H "PAYMENT-SIGNATURE: <base64 PaymentPayload>"`}</Code>
          <Code>{`${c.x402.code3a}
${c.x402.code3b}
A="pnpm --filter @proofmarket/scripts run run x402-agent.ts --base-url ${base}"

${c.x402.samples.map((s) => `$A ${s}`).join("\n")}`}</Code>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.x402.note}</p>
      </Section>

      <Section title={c.proof.title} lead={c.proof.lead}>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          {c.proof.p[0]}
          <code className="font-mono">result.proof</code>
          {c.proof.p[1]}
          <code className="font-mono">url</code>
          {c.proof.p[2]}
          <code className="font-mono">badge_url</code>
          {c.proof.p[3]}
          <code className="font-mono">markdown</code>
          {c.proof.p[4]}
        </p>
        <div className="mt-4">
          <Code>{`"proof": {
  "url": "${base}/r/ver_01J9Z4K8...",
  "badge_url": "${base}/r/ver_01J9Z4K8.../badge.svg",
  "markdown": "[![${c.proof.badgeAlt}](${base}/r/ver_01J9Z4K8.../badge.svg)](${base}/r/ver_01J9Z4K8...)"
}`}</Code>
        </div>
      </Section>

      <Section title={c.map.title} lead={c.map.lead}>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          {c.map.p1}
          <code className="font-mono">"publish": true</code>
          {c.map.p2}
          <Link href={h("/map")} className="text-teal-700 underline">
            {c.map.link}
          </Link>
          {c.map.p3}
          <code className="font-mono">GET /v1/public/map</code>
          {c.map.p4}
        </p>
      </Section>

      <Section title={c.tools.title}>
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {c.tools.items.map(([name, desc]) => (
            <div key={name} className="grid gap-1 p-4 sm:grid-cols-[18rem_1fr]">
              <dt className="break-all font-mono text-sm font-semibold">{name}</dt>
              <dd className="text-sm text-slate-600">{desc}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">{c.tools.note}</p>
      </Section>

      <Section title={c.fields.title} lead={c.fields.lead}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Code>{createBody}</Code>
          <dl className="space-y-3 text-sm">
            {c.fields.items(types).map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono font-semibold">{k}</dt>
                <dd className="mt-0.5 leading-relaxed text-slate-600">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section title={c.outcomes.title} lead={c.outcomes.lead}>
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {c.outcomes.items.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
              <dt className="font-mono text-sm font-semibold">{k}</dt>
              <dd className="text-sm text-slate-600">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {c.outcomes.p1}
          <code className="mx-1 font-mono">GET /v1/verifications/{"{id}"}/evidence</code>
          {c.outcomes.p2}
        </p>
      </Section>

      <Section title={c.webhook.title} lead={c.webhook.lead}>
        <ul className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((e) => (
            <li key={e} className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs">
              {e}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={c.dispute.title} lead={c.dispute.lead}>
        <Code>{`curl -X POST ${base}/v1/verifications/ver_.../dispute \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "reason": "${c.dispute.reason}", "assurance": { "level": "high" } }'`}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.dispute.p}</p>
      </Section>

      <Section title={c.reuse.title} lead={c.reuse.lead}>
        <Code>{c.reuse.code}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.reuse.p}</p>
      </Section>

      <Section title={c.batch.title} lead={c.batch.lead}>
        <Code>{c.batch.code}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.batch.p}</p>
      </Section>

      <Section title={c.senses.title} lead={c.senses.lead}>
        <Code>{c.senses.code}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.senses.p}</p>
      </Section>

      <Section title={c.schedule.title} lead={c.schedule.lead}>
        <Code>{`curl -X POST ${base}/v1/schedules \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "request": { ${c.schedule.codeRequest} },
    "deadline_minutes": 30,
    "times_jst": ["09:00"],
    "days_jst": [1, 2, 3, 4, 5]
  }'`}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.schedule.p}</p>
      </Section>

      <Section title={c.watch.title} lead={c.watch.lead}>
        <Code>{`curl -X POST ${base}/v1/schedules \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "request": { ${c.watch.codeRequest} },
    "deadline_minutes": 60,
    "every_minutes": 120,                 ${c.watch.c1}
    "max_runs": 12,                       ${c.watch.c2}
    "stop_when": { "answer": "IN_STOCK" } ${c.watch.c3}
  }'`}</Code>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          {c.watch.p[0]}
          <code className="font-mono">{'{ "answer": ... }'}</code>
          {c.watch.p[1]}
          <code className="font-mono">{'{ "answer_in": [...] }'}</code>
          {c.watch.p[2]}
          <code className="font-mono">{'{ "number": { "min": 1 } }'}</code>
          {c.watch.p[3]}
        </p>
      </Section>

      <Section title={c.limits.title}>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{c.limits.p}</p>
      </Section>
    </>
  );
}
