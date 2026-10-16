"use client";
// S-16 /connect — the whole "connect your agent" path on one page (13 §7, 2026-10-13):
// 1 get an API key (issued here, or paste one) → 2 pick your AI and follow its steps, key already filled in →
// 3 check that it is connected. The key lives in React state only; nothing is written to storage.
import { useState } from "react";
import { useLang } from "@/lib/client/lang";
import { Plain } from "@/lib/client/plain";
import { type Lang, langHref, pick } from "@/lib/lang";

type ClientId = "claude-ai" | "chatgpt" | "claude-code" | "codex" | "editor" | "rest";
type Issued = { apiKey: string; principalRef: string; trial: string; emailed: boolean };
type Step = { text: string; copy?: string; note?: string };

const KEY_PLACEHOLDER = "pm_test_...";

export function ConnectFlow({ base, cluster }: { base: string; cluster: "devnet" | "mainnet-beta" }) {
  const devnet = cluster === "devnet";
  const lang = useLang();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pasted, setPasted] = useState("");
  const [client, setClient] = useState<ClientId | null>(null);
  const key = issued?.apiKey ?? (pasted.trim().startsWith("pm_") ? pasted.trim() : "");
  const hasKey = key !== "";
  const k = hasKey ? key : KEY_PLACEHOLDER;
  const h = (p: string) => langHref(lang, p);

  return (
    <div className="space-y-12">
      <StepHeading
        n={1}
        title={pick(lang, "API キーを受け取る", "Get an API key")}
        done={hasKey}
        lang={lang}
      />
      <div className="-mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold">{pick(lang, "はじめての方", "First time here")}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            <Plain>
              {pick(
                lang,
                devnet
                  ? "メールアドレスを入れると、キーがその場に出ます。試験用の残高（Devnet の USDC）もついてきます。"
                  : "メールアドレスを入れると、キーがその場に出ます。依頼を出す前に、依頼者の画面から USDC か SOL を入金します。",
                devnet
                  ? "Enter your email address and the key appears right here, with a trial balance of Devnet test USDC."
                  : "Enter your email address and the key appears right here. Top up USDC or SOL from the requester console before your first request.",
              )}
            </Plain>
          </p>
          {issued ? (
            <IssuedNotice lang={lang} issued={issued} />
          ) : (
            <IssueForm lang={lang} onIssued={setIssued} disabled={pasted.trim() !== ""} />
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold">{pick(lang, "キーをもう持っている方", "Already have a key?")}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            <Plain>
              {pick(
                lang,
                "ここに貼ると、下の手順にそのキーが入ります。キーはこの画面の中でだけ使い、ブラウザには残しません。",
                "Paste it here and the steps below will carry it. The key is used on this page only and is never stored in the browser.",
              )}
            </Plain>
          </p>
          <label htmlFor="pasted-key" className="mt-4 block text-sm font-semibold">
            {pick(lang, "API キー（pm_test_ で始まる）", "API key (starts with pm_test_)")}
          </label>
          <input
            id="pasted-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={pasted}
            disabled={issued !== null}
            onChange={(e) => setPasted(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-base disabled:bg-slate-50"
          />
        </div>
      </div>

      <StepHeading
        n={2}
        title={pick(lang, "使っている AI を選ぶ", "Pick the AI you use")}
        done={client !== null}
        lang={lang}
      />
      <div className="-mt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClient(c.id)}
              aria-pressed={client === c.id}
              className={`min-h-20 rounded-2xl border p-4 text-left transition ${
                client === c.id
                  ? "border-teal-700 bg-teal-50 ring-2 ring-teal-700"
                  : "border-slate-200 hover:border-teal-600"
              }`}
            >
              <span className="block font-bold">{clientName(lang, c)}</span>
              <span className="mt-1 block text-xs text-slate-500">{pick(lang, c.subJa, c.subEn)}</span>
            </button>
          ))}
        </div>
        {client ? (
          <ClientSteps lang={lang} client={client} base={base} apiKey={k} hasKey={hasKey} issued={issued} />
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            {pick(lang, "選ぶと、その AI の手順だけが出ます。", "Choose one and only its steps are shown.")}
          </p>
        )}
      </div>

      <StepHeading
        n={3}
        title={pick(lang, "つながったか確かめる", "Check that it is connected")}
        lang={lang}
      />
      <div className="-mt-6 space-y-4">
        {client === "rest" ? (
          <CopyBlock
            lang={lang}
            label={pick(lang, "ターミナルで実行する", "Run in a terminal")}
            text={`curl ${base}/v1/health`}
            note={pick(
              lang,
              '{"status":"ok"} のような応答が返れば、窓口に届いています。依頼の出し方は下の「次にできること」から。',
              'A response like {"status":"ok"} means the endpoint is reachable. How to send a request is under "What next".',
            )}
          />
        ) : (
          <>
            <CopyBlock
              lang={lang}
              label={pick(lang, "AI に、まずこう送る", "First, send this to your AI")}
              text={pick(lang, "ProofMarket の道具を一覧して", "List ProofMarket's tools")}
              note={pick(
                lang,
                "request_reality_verification など 4 つ以上の道具の名前が返れば、つながっています。出てこないときは、下の「つながらないとき」へ。",
                'If it names four or more tools, such as request_reality_verification, you are connected. If not, see "If it does not connect" below.',
              )}
            />
            <CopyBlock
              lang={lang}
              label={pick(lang, "続けて、最初の依頼を出す", "Then send your first request")}
              text={pick(
                lang,
                "渋谷駅の東口のエレベーターが今動いているか、ProofMarket で人に確かめてもらって。報酬は 1 人 0.3 USDC、締め切りは 45 分後。",
                "Ask a person through ProofMarket whether the lift at the east exit of Shibuya station is working right now. Bounty 0.3 USDC per person, deadline in 45 minutes.",
              )}
              note={pick(
                lang,
                devnet
                  ? "試験用の残高から払われます。worker が答えると、AI が結果と証明のリンクを伝えます。"
                  : "残高から払われます（先に依頼者の画面で入金してください）。worker が答えると、AI が結果と証明のリンクを伝えます。",
                devnet
                  ? "It is paid from the trial balance. When a worker answers, the AI relays the result and a proof link."
                  : "It is paid from your balance (top up in the requester console first). When a worker answers, the AI relays the result and a proof link.",
              )}
            />
          </>
        )}
        <p className="text-sm text-slate-600">
          {pick(lang, "依頼の履歴と残高は", "Your request history and balance are in the ")}
          <a href={h("/console")} className="font-semibold text-teal-700 underline">
            {pick(lang, "依頼者の画面", "requester console")}
          </a>
          {pick(lang, "で見られます。", ".")}
        </p>
      </div>

      <section>
        <h2 className="text-xl font-bold tracking-tight">
          {pick(lang, "つながらないとき", "If it does not connect")}
        </h2>
        <div className="mt-3 space-y-2">
          {TROUBLE.map((t) => (
            <details key={t.ja.q} className="rounded-2xl border border-slate-200 p-4 open:bg-slate-50/50">
              <summary className="cursor-pointer select-none font-semibold">
                {pick(lang, t.ja.q, t.en.q)}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                <Plain>{pick(lang, t.ja.a, t.en.a)}</Plain>
              </p>
            </details>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {pick(
            lang,
            "それでも直らなければ、画面に出た文言をそのまま",
            "Still stuck? Send the exact message you saw through the ",
          )}
          <a href={h("/join")} className="font-semibold text-teal-700 underline">
            {pick(lang, "申し込みフォーム", "sign-up form")}
          </a>
          {pick(lang, "から送ってください。", ".")}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight">{pick(lang, "次にできること", "What next")}</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            {
              href: "/developers",
              t: pick(lang, "詳しい仕様", "Full reference"),
              s: pick(
                lang,
                "REST・x402・証明のリンク・みんなの地図・見守り",
                "REST, x402, proof links, the public map, watches",
              ),
            },
            {
              href: "/pricing",
              t: pick(lang, "料金", "Pricing"),
              s: pick(
                lang,
                "1 人あたりの報酬 × 人数 + 手数料 15%",
                "Bounty per person × people asked, plus a 15% fee",
              ),
            },
            {
              href: "/console",
              t: pick(lang, "依頼者の画面", "Requester console"),
              s: pick(lang, "履歴・残高・入金", "History, balance, top-ups"),
            },
          ].map((x) => (
            <li key={x.href}>
              <a href={h(x.href)} className="card-link block rounded-2xl border border-slate-200 p-4">
                <span className="block font-bold">
                  {x.t} <span className="arrow">→</span>
                </span>
                <span className="mt-1 block text-xs text-slate-500">{x.s}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StepHeading({ n, title, done, lang }: { n: number; title: string; done?: boolean; lang: Lang }) {
  return (
    <div className="flex items-center gap-4">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-bold ${
          done ? "bg-teal-700 text-white" : "bg-teal-50 text-teal-800"
        }`}
        aria-hidden="true"
      >
        {done ? "✓" : n}
      </span>
      <h2 className="text-2xl font-bold tracking-tight">
        <span className="sr-only">{pick(lang, `ステップ ${n}: `, `Step ${n}: `)}</span>
        {title}
      </h2>
    </div>
  );
}

// ---------- step 1: issue a key (same API as the worker sign-up, role = requester; 01 §4.28) ----------

function IssueForm({
  lang,
  onIssued,
  disabled,
}: {
  lang: Lang;
  onIssued: (i: Issued) => void;
  disabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/v1/public/participation-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "requester",
        email,
        note: note.trim() || undefined,
        consent,
        website: website || undefined,
        lang,
      }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (res?.ok && typeof body?.api_key === "string") {
      onIssued({
        apiKey: body.api_key,
        principalRef: typeof body.principal_ref === "string" ? body.principal_ref : "",
        trial: typeof body.trial_balance === "string" ? body.trial_balance : "",
        emailed: body.emailed === true,
      });
      return;
    }
    const err = (body?.error ?? {}) as { code?: string; details?: { limit?: string } };
    setMsg(
      err.details?.limit === "per_day"
        ? pick(
            lang,
            "この接続元からは、今日はもう API キーを発行できません（1 日 3 つまで）。明日もう一度お試しください。",
            "No more API keys can be issued from this network today (3 per day). Please try again tomorrow.",
          )
        : err.code === "RATE_LIMITED"
          ? pick(
              lang,
              "短い時間に何度も送られています。1 分ほど待ってから送ってください。",
              "Too many submissions in a short time. Please wait a minute and try again.",
            )
          : err.code === "VALIDATION_FAILED"
            ? pick(
                lang,
                "入力を確かめてください。メールアドレスの形と、同意のチェックが必要です。",
                "Please check your input: a valid email address and the consent box are required.",
              )
            : pick(
                lang,
                "送れませんでした。通信の状態を確かめて、もう一度送ってください。",
                "Could not send. Please check your connection and try again.",
              ),
    );
    setState("error");
  }

  const input = "mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base disabled:bg-slate-50";
  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label htmlFor="connect-email" className="text-sm font-semibold">
          {pick(lang, "メールアドレス", "Email address")}
        </label>
        <input
          id="connect-email"
          type="email"
          required
          autoComplete="email"
          disabled={disabled}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="connect-note" className="text-sm font-semibold">
          {pick(lang, "どんなエージェントで使いますか（任意）", "What kind of agent will use it? (optional)")}
        </label>
        <input
          id="connect-note"
          maxLength={500}
          disabled={disabled}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={input}
        />
      </div>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="connect-website">Website</label>
        <input
          id="connect-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 accent-teal-700"
        />
        <span>
          {pick(
            lang,
            "メールアドレスは、このキーについての連絡にだけ使います。暗号化して保存し、90 日で消します。この扱いに同意します。",
            "Your email address is used only to contact you about this key. It is stored encrypted and deleted after 90 days. I agree to this.",
          )}
        </span>
      </label>
      {state === "error" ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">{msg}</p>
      ) : null}
      <button
        type="submit"
        disabled={disabled || !consent || !email || state === "busy"}
        className="w-full rounded-2xl bg-teal-700 px-4 py-3 text-base font-bold text-white disabled:opacity-40"
      >
        {state === "busy"
          ? pick(lang, "発行しています…", "Issuing…")
          : pick(lang, "キーを受け取る", "Get my key")}
      </button>
    </form>
  );
}

function IssuedNotice({ lang, issued }: { lang: Lang; issued: Issued }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
        <p className="font-bold">{pick(lang, "キーを発行しました。", "Your key is ready.")}</p>
        <p className="mt-1 text-sm leading-relaxed">
          {pick(
            lang,
            issued.trial !== "0"
              ? `表示されるのは今だけです。運営者の側にもキーそのものは残らないので、コピーして保管してください。残高は ${issued.trial} USDC（Devnet の試験用）から始まります。`
              : "表示されるのは今だけです。運営者の側にもキーそのものは残らないので、コピーして保管してください。残高は 0 から始まります。依頼者の画面から入金してください。",
            issued.trial !== "0"
              ? `This is the only time it is shown; we keep only a hash of it, so copy it and keep it safe. Your balance starts at ${issued.trial} USDC (Devnet test USDC).`
              : "This is the only time it is shown; we keep only a hash of it, so copy it and keep it safe. Your balance starts at 0: top up from the requester console.",
          )}
          {issued.emailed
            ? pick(
                lang,
                "入力したメールアドレスにも控えを送りました。",
                " A copy was also sent to your email address.",
              )
            : ""}
        </p>
      </div>
      <CopyBlock lang={lang} label={pick(lang, "API キー", "API key")} text={issued.apiKey} />
    </div>
  );
}

// ---------- step 2: one AI at a time, its steps with the key already in ----------

const CLIENTS: { id: ClientId; name: string; nameEn?: string; subJa: string; subEn: string }[] = [
  { id: "claude-ai", name: "claude.ai", subJa: "ブラウザ・アプリ", subEn: "browser and apps" },
  { id: "chatgpt", name: "ChatGPT", subJa: "Plus 以上", subEn: "Plus or above" },
  { id: "claude-code", name: "Claude Code", subJa: "ターミナル", subEn: "terminal" },
  { id: "codex", name: "Codex CLI", subJa: "OpenAI・ターミナル", subEn: "OpenAI, terminal" },
  { id: "editor", name: "Cursor / Windsurf", subJa: "MCP 対応エディタ", subEn: "MCP-capable editors" },
  {
    id: "rest",
    name: "自作のエージェント",
    nameEn: "Your own agent",
    subJa: "REST・SDK",
    subEn: "REST, SDK",
  },
];
const clientName = (lang: Lang, c: (typeof CLIENTS)[number]) =>
  lang === "en" ? (c.nameEn ?? c.name) : c.name;

const VERIFIED: Record<ClientId, boolean> = {
  "claude-ai": true,
  chatgpt: false,
  "claude-code": true,
  codex: true,
  editor: false,
  rest: true,
};

function stepsFor(lang: Lang, client: ClientId, base: string, key: string, principalRef: string): Step[] {
  const mcp = `${base}/mcp`;
  const paste = (who: string) =>
    pick(
      lang,
      `Set up ProofMarket for me: read ${base}/llms.txt and follow its setup instructions for ${who}. My ProofMarket API key: ${key}`,
      `Set up ProofMarket for me: read ${base}/llms.txt and follow its setup instructions for ${who}. My ProofMarket API key: ${key}`,
    );
  const consent = pick(
    lang,
    "「接続」を押すと ProofMarket の許可画面が開きます。そこに API キーを貼って「接続を許可する」を押します。",
    "Press “Connect”. ProofMarket's consent page opens; paste the API key there and press “Allow the connection”.",
  );
  switch (client) {
    case "claude-ai":
      return [
        {
          text: pick(
            lang,
            "claude.ai の 設定 → コネクタ → 「カスタムコネクタを追加」を開く",
            "In claude.ai, open Settings → Connectors → “Add custom connector”",
          ),
        },
        {
          text: pick(
            lang,
            "名前に ProofMarket、URL にこれを貼って追加する",
            "Name it ProofMarket and paste this as the URL",
          ),
          copy: mcp,
        },
        { text: consent, copy: key },
        {
          text: pick(
            lang,
            "新しい会話で ProofMarket をオンにする",
            "Turn ProofMarket on in a new conversation",
          ),
          note: pick(
            lang,
            "キーは ProofMarket にだけ渡り、claude.ai には保存されません。",
            "The key goes to ProofMarket only; claude.ai never stores it.",
          ),
        },
      ];
    case "chatgpt":
      return [
        {
          text: pick(
            lang,
            "設定 → アプリ（コネクタ）→ 詳細設定 で「開発者モード」をオンにする",
            "Under Settings → Apps (Connectors) → Advanced, turn on Developer mode",
          ),
        },
        {
          text: pick(
            lang,
            "「作成」で、名前に ProofMarket、MCP サーバーの URL にこれを貼り、認証は OAuth を選ぶ",
            "Press “Create”: name it ProofMarket, paste this as the MCP server URL, and choose OAuth for authentication",
          ),
          copy: mcp,
        },
        { text: consent, copy: key },
        {
          text: pick(
            lang,
            "新しい会話で ProofMarket をオンにする",
            "Turn ProofMarket on in a new conversation",
          ),
          note: pick(
            lang,
            "この手順は運営者がまだ通しで確かめていません。つまずいた所を教えてもらえると助かります。",
            "The operator has not yet verified this path end to end. Tell us where it stops.",
          ),
        },
      ];
    case "claude-code":
      return [
        {
          text: pick(
            lang,
            "いちばん簡単な方法: Claude Code のチャットにこれを貼る。Claude が自分で設定を済ませます",
            "The easiest way: paste this into a Claude Code chat. Claude does the setup itself",
          ),
          copy: paste("Claude Code"),
        },
        {
          text: pick(
            lang,
            "自分で設定するなら、ターミナルでこれを実行する",
            "Or set it up yourself: run this in a terminal",
          ),
          copy: `claude mcp add --transport http proofmarket ${mcp} --header "Authorization: Bearer ${key}"`,
        },
        {
          text: pick(lang, "claude を起動し直す（新しいセッション）", "Start claude again (a new session)"),
          note: pick(
            lang,
            "キーはこの端末の設定にだけ残ります。チャットに貼った文は、送ったあとで消しておくと安心です。",
            "The key stays in this machine's settings only. It is a good habit to delete the pasted message once it has been sent.",
          ),
        },
      ];
    case "codex":
      return [
        {
          text: pick(
            lang,
            "いちばん簡単な方法: Codex のチャットにこれを貼る。Codex が自分で設定を済ませます",
            "The easiest way: paste this into a Codex chat. Codex does the setup itself",
          ),
          copy: paste("Codex CLI"),
        },
        {
          text: pick(
            lang,
            "自分で設定するなら、ターミナルでこれを実行する",
            "Or set it up yourself: run this in a terminal",
          ),
          copy: `export PROOFMARKET_API_KEY=${key}\ncodex mcp add proofmarket --url ${mcp} --bearer-token-env-var PROOFMARKET_API_KEY`,
        },
        {
          text: pick(lang, "codex を起動し直す", "Start codex again"),
          note: pick(
            lang,
            "キーを環境変数に置きたくなければ、codex mcp add proofmarket --url " +
              mcp +
              " のあと codex mcp login proofmarket を実行し、開いた許可画面にキーを貼ります。Codex CLI 0.145 で確認済み。",
            "To keep the key out of the environment, run codex mcp add proofmarket --url " +
              mcp +
              " and then codex mcp login proofmarket, and paste the key on the consent page that opens. Checked with Codex CLI 0.145.",
          ),
        },
      ];
    case "editor":
      return [
        {
          text: pick(
            lang,
            "エディタの MCP の設定（Cursor は Settings → MCP、Claude Desktop は claude_desktop_config.json）にこれを足す",
            "Add this to the editor's MCP settings (Cursor: Settings → MCP; Claude Desktop: claude_desktop_config.json)",
          ),
          copy: JSON.stringify(
            { mcpServers: { proofmarket: { url: mcp, headers: { Authorization: `Bearer ${key}` } } } },
            null,
            2,
          ),
        },
        {
          text: pick(lang, "アプリを終了して開き直す", "Quit the app and open it again"),
          note: pick(
            lang,
            "OAuth に対応したエディタなら headers を省き、接続時に出る許可画面でキーを貼れます。この手順は運営者がまだ通しで確かめていません。",
            "An OAuth-capable editor can leave out headers and take the key on the consent page instead. The operator has not yet verified this path end to end.",
          ),
        },
      ];
    case "rest":
      return [
        {
          text: pick(lang, "キーを環境変数に入れる", "Put the key in an environment variable"),
          copy: `export PROOFMARKET_API_KEY=${key}`,
        },
        {
          text: pick(
            lang,
            "依頼を作る。本文の principal_ref にはこの ID を入れる（MCP では自動で入ります）",
            "Create a request. Put this ID in principal_ref in the body (MCP fills it in for you)",
          ),
          copy:
            principalRef ||
            pick(
              lang,
              "prn_…（ステップ 1 でキーを発行すると出ます）",
              "prn_… (shown when you issue a key in step 1)",
            ),
        },
        {
          text: pick(
            lang,
            "依頼の作成には Idempotency-Key ヘッダーが要ります",
            "Creating a request needs an Idempotency-Key header",
          ),
          copy: `curl -X POST ${base}/v1/verifications \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d @request.json`,
          note: pick(
            lang,
            "request.json の中身と、TypeScript の SDK（packages/sdk の ProofMarketClient）は「詳しい仕様」にあります。",
            "The shape of request.json and the TypeScript SDK (ProofMarketClient in packages/sdk) are in the full reference.",
          ),
        },
      ];
  }
}

function ClientSteps({
  lang,
  client,
  base,
  apiKey,
  hasKey,
  issued,
}: {
  lang: Lang;
  client: ClientId;
  base: string;
  apiKey: string;
  hasKey: boolean;
  issued: Issued | null;
}) {
  const steps = stepsFor(lang, client, base, apiKey, issued?.principalRef ?? "");
  const found = CLIENTS.find((c) => c.id === client);
  const name = found ? clientName(lang, found) : client;
  return (
    <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{pick(lang, `${name} でつなぐ`, `Connect from ${name}`)}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            VERIFIED[client] ? "bg-white text-teal-800 ring-1 ring-teal-600" : "bg-slate-100 text-slate-600"
          }`}
        >
          {VERIFIED[client]
            ? pick(lang, "運営者が確認済み", "Verified by the operator")
            : pick(lang, "手順のみ（未確認）", "Steps only (not verified)")}
        </span>
      </div>
      {!hasKey ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          {pick(
            lang,
            "ステップ 1 でキーを受け取るか貼ると、下の pm_test_... の所に自動で入ります。",
            "Get or paste a key in step 1 and it will replace pm_test_... below automatically.",
          )}
        </p>
      ) : null}
      <ol className="mt-4 space-y-5">
        {steps.map((s, i) => (
          <li key={s.text} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-teal-800 ring-1 ring-teal-600">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-slate-800">
                <Plain>{s.text}</Plain>
              </p>
              {s.copy ? <CopyBlock lang={lang} text={s.copy} compact /> : null}
              {s.note ? <p className="mt-2 text-xs leading-relaxed text-slate-500">{s.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------- shared ----------

function CopyBlock({
  lang,
  label,
  text,
  note,
  compact,
}: {
  lang: Lang;
  label?: string;
  text: string;
  note?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={compact ? "mt-2" : ""}>
      {label ? <p className="text-sm font-semibold">{label}</p> : null}
      <div className="relative mt-1">
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-slate-900 p-4 pr-24 text-xs leading-relaxed text-slate-100">
          <code>{text}</code>
        </pre>
        <button
          type="button"
          className="absolute right-2 top-2 min-h-9 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              },
              () => setCopied(false),
            );
          }}
        >
          {copied ? pick(lang, "コピーしました", "Copied") : pick(lang, "コピー", "Copy")}
        </button>
      </div>
      {note ? <p className="mt-2 text-xs leading-relaxed text-slate-500">{note}</p> : null}
    </div>
  );
}

const TROUBLE: { ja: { q: string; a: string }; en: { q: string; a: string } }[] = [
  {
    ja: {
      q: "道具の一覧に ProofMarket が出てこない",
      a: "設定は起動のときに読まれます。アプリを完全に終了して開き直すか、Claude Code や Codex なら新しいセッションを始めてください。claude.ai と ChatGPT は、新しい会話で ProofMarket をオンにする必要があります。",
    },
    en: {
      q: "ProofMarket does not show up in the tool list",
      a: "Settings are read at start-up. Fully quit and reopen the app, or start a new session in Claude Code or Codex. In claude.ai and ChatGPT, ProofMarket has to be turned on in a new conversation.",
    },
  },
  {
    ja: {
      q: "許可画面で「キーが違う」と言われる",
      a: "キーは pm_test_ で始まる 1 行です。前後の空白や改行が混ざっていないか確かめ、ステップ 1 で受け取ったものをそのまま貼ってください。キーをなくしたときは、ステップ 1 でもう一度発行できます（1 日 3 つまで）。",
    },
    en: {
      q: "The consent page says the key is wrong",
      a: "The key is one line starting with pm_test_. Check for stray spaces or line breaks and paste exactly what step 1 gave you. If you lost it, issue a new one in step 1 (up to three a day).",
    },
  },
  {
    ja: {
      q: "ChatGPT に「開発者モード」が無い",
      a: "カスタムコネクタは Plus 以上のプランで使えます。無料プランでは追加できません。",
    },
    en: {
      q: "ChatGPT has no Developer mode",
      a: "Custom connectors need a Plus plan or above. They cannot be added on the free plan.",
    },
  },
  {
    ja: {
      q: "依頼を出したのに何も起きない",
      a: "worker が近くにいないと、依頼は締め切りまで待ちます。worker はまだ多くないため、昼間の渋谷・新宿のあたりがいちばん答えが付きやすいです。依頼者の画面で状態を確かめられます。",
    },
    en: {
      q: "I sent a request and nothing happens",
      a: "If no worker is nearby, the request waits until its deadline. Workers are still few, so daytime requests around Shibuya and Shinjuku get answered soonest. The requester console shows the state.",
    },
  },
];
