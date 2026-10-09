"use client";
// S-04 /join form. Posts to /v1/public/participation-requests (04 §3.20).
import { useState } from "react";
import { useLang } from "@/lib/client/lang";
import { Plain } from "@/lib/client/plain";
import { pick } from "@/lib/lang";

type Role = "worker" | "requester";

export function JoinForm({ initialRole }: { initialRole: Role }) {
  const lang = useLang();
  const [role, setRole] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("shibuya");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [issued, setIssued] = useState<{
    apiKey: string;
    principalRef: string;
    trial: string;
    emailed: boolean;
  } | null>(null);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/v1/public/participation-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role,
        email,
        area: role === "worker" ? area : undefined,
        note: note.trim() || undefined,
        consent,
        website: website || undefined,
        lang,
      }),
    }).catch(() => null);
    if (res?.ok) {
      const body = (await res.json().catch(() => null)) as {
        api_key?: string;
        principal_ref?: string;
        trial_balance?: string;
        emailed?: boolean;
      } | null;
      setIssued(
        body?.api_key
          ? {
              apiKey: body.api_key,
              principalRef: body.principal_ref ?? "",
              trial: body.trial_balance ?? "",
              emailed: body.emailed === true,
            }
          : null,
      );
      setState("done");
      return;
    }
    const code = res
      ? ((await res.json().catch(() => null)) as {
          error?: { code?: string; details?: { limit?: string } };
        } | null)
      : null;
    setMsg(
      code?.error?.details?.limit === "per_day"
        ? pick(
            lang,
            "この接続元からは、今日はもう API キーを発行できません（1日3つまで）。明日もう一度お試しください。",
            "No more API keys can be issued from this network today (3 per day). Please try again tomorrow.",
          )
        : code?.error?.code === "RATE_LIMITED"
          ? pick(
              lang,
              "短い時間に何度も送られています。1分ほど待ってから送ってください。",
              "Too many submissions in a short time. Please wait a minute and try again.",
            )
          : code?.error?.code === "VALIDATION_FAILED"
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

  if (state === "done" && issued) {
    return <IssuedKey lang={lang} {...issued} />;
  }
  if (state === "done") {
    return (
      <div className="rounded-2xl bg-emerald-50 p-6 text-emerald-900 ring-1 ring-emerald-200">
        <p className="font-bold">{pick(lang, "受け付けました。", "Received.")}</p>
        <p className="mt-1 text-sm leading-relaxed">
          {pick(
            lang,
            "運営者が内容を確かめて、入力したメールアドレスに招待コードを送ります。試験運用中のため、すぐにはお返事できないことがあります。",
            "The operator will review your application and email an invite code to the address you entered. During the pilot, a reply may take a little while.",
          )}
        </p>
      </div>
    );
  }

  const input = "mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base";
  const roles = [
    [
      "worker",
      pick(lang, "worker として参加したい", "Join as a worker"),
      pick(lang, "招待コードを受け取る", "Get an invite code"),
    ],
    [
      "requester",
      pick(lang, "エージェントからつなぎたい", "Connect an agent"),
      pick(lang, "API キーを受け取る", "Get an API key"),
    ],
  ] as const;
  return (
    <form onSubmit={submit} className="max-w-xl space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold">
          {pick(lang, "申し込みの種類", "What are you applying for?")}
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {roles.map(([v, label, sub]) => (
            <label
              key={v}
              className={`cursor-pointer rounded-xl border p-3 ${role === v ? "border-teal-700 bg-teal-50" : "border-slate-300"}`}
            >
              <input
                type="radio"
                name="role"
                value={v}
                checked={role === v}
                onChange={() => setRole(v)}
                className="sr-only"
              />
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-slate-500">
                <Plain>{sub}</Plain>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="email" className="text-sm font-semibold">
          {pick(lang, "メールアドレス", "Email address")}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
      </div>

      {role === "worker" ? (
        <div>
          <label htmlFor="area" className="text-sm font-semibold">
            {pick(lang, "よく行く場所", "Where are you usually?")}
          </label>
          <select id="area" value={area} onChange={(e) => setArea(e.target.value)} className={input}>
            <option value="shibuya">{pick(lang, "渋谷のあたり", "Around Shibuya")}</option>
            <option value="shinjuku">{pick(lang, "新宿のあたり", "Around Shinjuku")}</option>
            <option value="other">{pick(lang, "それ以外の東京都心", "Elsewhere in central Tokyo")}</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {pick(
              lang,
              "おおまかな地域だけを聞きます。住所は書かないでください。",
              "Only a rough area. Please do not enter an address.",
            )}
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="note" className="text-sm font-semibold">
          {role === "worker"
            ? pick(lang, "ひとこと（任意）", "A note (optional)")
            : pick(
                lang,
                "どんなエージェントで使いたいか（任意）",
                "What kind of agent will use it? (optional)",
              )}
        </label>
        <textarea
          id="note"
          maxLength={500}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={input}
        />
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-5 w-5 accent-teal-700"
        />
        <span>
          {pick(
            lang,
            "メールアドレスは、この申し込みへの連絡にだけ使います。暗号化して保存し、90日で消します。この扱いに同意します。",
            "Your email address is used only to reply to this application. It is stored encrypted and deleted after 90 days. I agree to this.",
          )}
        </span>
      </label>

      {state === "error" ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">{msg}</p>
      ) : null}

      <button
        type="submit"
        disabled={!consent || !email || state === "busy"}
        className="w-full rounded-2xl bg-teal-700 px-4 py-4 text-base font-bold text-white disabled:opacity-40"
      >
        {state === "busy" ? pick(lang, "送っています…", "Sending…") : pick(lang, "申し込む", "Apply")}
      </button>
    </form>
  );
}

/** The key, once, with what to paste into each kind of agent (01 §4.28). */
function IssuedKey({
  lang,
  apiKey,
  principalRef,
  trial,
  emailed,
}: {
  lang: ReturnType<typeof useLang>;
  apiKey: string;
  principalRef: string;
  trial: string;
  emailed: boolean;
}) {
  const base = typeof window === "undefined" ? "https://proofmarket.fun" : window.location.origin;
  const snippets: [string, string][] = [
    [pick(lang, "API キー", "API key"), apiKey],
    [
      pick(
        lang,
        "principal_ref（REST で依頼を作るときに本文に入れる ID。MCP では自動で入ります）",
        "principal_ref (goes in REST request bodies; MCP fills it in)",
      ),
      principalRef,
    ],
    [
      pick(lang, "Claude Code（ターミナルで実行）", "Claude Code (run in a terminal)"),
      `claude mcp add --transport http proofmarket ${base}/mcp --header "Authorization: Bearer ${apiKey}"`,
    ],
    [
      pick(
        lang,
        "MCP の設定ファイル（Cursor・Claude Desktop など）",
        "MCP config (Cursor, Claude Desktop, ...)",
      ),
      JSON.stringify(
        {
          mcpServers: { proofmarket: { url: `${base}/mcp`, headers: { Authorization: `Bearer ${apiKey}` } } },
        },
        null,
        2,
      ),
    ],
    [
      pick(lang, "REST API（環境変数に入れる）", "REST API (as an environment variable)"),
      `export PROOFMARKET_API_KEY=${apiKey}\ncurl ${base}/v1/health`,
    ],
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-emerald-50 p-6 text-emerald-900 ring-1 ring-emerald-200">
        <p className="font-bold">{pick(lang, "API キーを発行しました。", "Your API key is ready.")}</p>
        <p className="mt-1 text-sm leading-relaxed">
          {pick(
            lang,
            `このキーが表示されるのは今だけです。運営者の側にもキーそのものは残らないので、いまコピーして保管してください。最初の残高として ${trial} USDC（Devnet の試験用）を入れてあります。`,
            `This is the only time the key is shown; we keep only a hash of it, so copy it now. It starts with ${trial} USDC (Devnet test USDC).`,
          )}
          {emailed
            ? pick(
                lang,
                "入力したメールアドレスにも控えを送りました。",
                " A copy was also sent to your email address.",
              )
            : ""}
        </p>
      </div>
      {snippets.map(([label, text]) => (
        <CopyBlock key={label} label={label} text={text} lang={lang} />
      ))}
      <p className="text-sm text-slate-600">
        {pick(
          lang,
          "claude.ai や ChatGPT などのリモート MCP は、",
          "For remote MCP in claude.ai, ChatGPT and others, ",
        )}
        <a className="font-semibold text-teal-800 underline" href="/developers">
          {pick(lang, "開発者向けの案内", "the developer guide")}
        </a>
        {pick(
          lang,
          "の手順で URL を追加し、認証の画面でこのキーを入れます。",
          " shows how to add the URL; paste this key on the sign-in screen.",
        )}
      </p>
    </div>
  );
}

function CopyBlock({ label, text, lang }: { label: string; text: string; lang: ReturnType<typeof useLang> }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <button
          type="button"
          className="min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-slate-300 px-4 text-sm font-semibold"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? pick(lang, "コピーしました", "Copied") : pick(lang, "コピー", "Copy")}
        </button>
      </div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
        <code>{text}</code>
      </pre>
    </div>
  );
}
