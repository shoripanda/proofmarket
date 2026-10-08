import "server-only";
import { type Lang, pick } from "./lang";

// Consent page for MCP OAuth (05 §6.2). Plain HTML from the route handler: no client JS, no third-party origins.
// The language follows the browser's Accept-Language (the route passes it), since there is no /en URL here.

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
};

const STYLE = `
body{font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:16px}
main{max-width:420px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px}
h1{font-size:18px;margin:0 0 16px}p{font-size:14px;line-height:1.7;margin:0 0 12px}
.host{font-family:ui-monospace,monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px}
.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;font-size:13px}
.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 12px;font-size:13px}
label{display:block;font-size:13px;margin:16px 0 6px}
input[type=password]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-size:15px}
@media (prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}main{background:#1e293b;border-color:#334155}
.host{background:#334155}.warn{background:#422006;border-color:#854d0e}.err{background:#450a0a;border-color:#7f1d1d;color:#fecaca}
input[type=password]{background:#0f172a;color:#e2e8f0;border-color:#475569}button{background:#e2e8f0;color:#0f172a}}`;

/** "en" when the browser prefers English over Japanese; Japanese otherwise. */
export function langFromAccept(header: string | null): Lang {
  const langs = (header ?? "")
    .split(",")
    .map((p) => p.trim().split(";")[0]?.toLowerCase() ?? "")
    .filter(Boolean);
  for (const l of langs) {
    if (l.startsWith("ja")) return "ja";
    if (l.startsWith("en")) return "en";
  }
  return "ja";
}

const page = (lang: Lang, title: string, body: string) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;

export function consentPage(o: {
  clientName: string;
  redirectUri: string;
  params: URLSearchParams;
  error?: string;
  lang?: Lang;
}) {
  const lang = o.lang ?? "ja";
  const hidden = [...o.params.entries()]
    .filter(([k]) => k !== "api_key")
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  const title = pick(lang, "ProofMarket に接続", "Connect to ProofMarket");
  const host = esc(new URL(o.redirectUri).host);
  const body = `
<h1>${esc(title)}</h1>
<p>${pick(
    lang,
    `<b>${esc(o.clientName)}</b> が、あなたの API キーで ProofMarket に依頼を出せるようにします。`,
    `This lets <b>${esc(o.clientName)}</b> send requests to ProofMarket with your API key.`,
  )}</p>
<p>${pick(
    lang,
    `接続が終わると <span class="host">${host}</span> に戻ります。`,
    `After connecting you will return to <span class="host">${host}</span>.`,
  )}</p>
<p class="warn">${pick(
    lang,
    "自分で始めた接続でなければ、キーを入れずにこの画面を閉じてください。",
    "If you did not start this connection yourself, close this page without entering a key.",
  )}</p>
${o.error ? `<p class="err">${esc(o.error)}</p>` : ""}
<form method="post" action="/oauth/authorize">${hidden}
<label for="k">${pick(lang, "API キー（pm_test_ で始まる文字列）", "API key (starts with pm_test_)")}</label>
<input id="k" name="api_key" type="password" autocomplete="off" required>
<button type="submit">${pick(lang, "接続を許可する", "Allow the connection")}</button>
</form>`;
  return new Response(page(lang, title, body), { status: o.error ? 401 : 200, headers: HEADERS });
}

export function errorPage(message: string, lang: Lang = "ja") {
  const title = pick(lang, "接続できません", "Cannot connect");
  return new Response(
    page(
      lang,
      title,
      `<h1>${esc(title)}</h1><p class="err">${esc(message)}</p><p>${pick(
        lang,
        "接続を始めたアプリに戻って、やり直してください。",
        "Go back to the app that started the connection and try again.",
      )}</p>`,
    ),
    { status: 400, headers: HEADERS },
  );
}
