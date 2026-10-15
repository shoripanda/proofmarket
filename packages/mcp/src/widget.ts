// ChatGPT widget (OpenAI Apps SDK; docs/architecture 02 §4.3): an HTML resource ChatGPT renders in an iframe
// after request_reality_verification / get_reality_verification. It reads the tool's structuredContent from
// window.openai.toolOutput and shows the state, the summary, the answer, the AI review and the proof link.
// claude.ai and other clients ignore the "openai/*" metadata and keep using the JSON result.

export const WIDGET_URI = "ui://widget/verification.html";
export const WIDGET_MIME = "text/html+skybridge";

/** Tool metadata the Apps SDK reads (the keys are OpenAI's; other clients ignore them). */
export const WIDGET_META = {
  "openai/outputTemplate": WIDGET_URI,
  "openai/toolInvocation/invoking": "Asking a person to check…",
  "openai/toolInvocation/invoked": "Verification state loaded",
  "openai/widgetAccessible": false,
  "openai/resultCanProduceWidget": true,
} as const;

/** No external scripts, fonts or images: the page is complete as sent, and nothing in it is secret. */
export const WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ProofMarket</title>
<style>
  :root { --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --ok: #0f766e; --warn: #b45309; --bad: #b91c1c; --bg: #fff; }
  @media (prefers-color-scheme: dark) { :root { --ink: #e2e8f0; --muted: #94a3b8; --line: #334155; --bg: #0b1220; } }
  body { margin: 0; padding: 16px; font: 14px/1.5 -apple-system, "Segoe UI", Roboto, "Hiragino Sans", sans-serif; color: var(--ink); background: var(--bg); }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); font-size: 12px; font-weight: 600; }
  .pill.ok { color: var(--ok); border-color: var(--ok); }
  .pill.bad { color: var(--bad); border-color: var(--bad); }
  .pill.warn { color: var(--warn); border-color: var(--warn); }
  .muted { color: var(--muted); font-size: 12px; }
  .answer { font-size: 22px; font-weight: 700; margin: 8px 0; word-break: break-word; }
  .box { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
  .box h4 { margin: 0 0 4px; font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  ul { margin: 0; padding-left: 18px; }
  a { color: inherit; }
  .proof { display: inline-block; margin-top: 10px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--ok); color: var(--ok); font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<div id="root"><span class="muted">Loading…</span></div>
<script>
(function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pillClass = function (status) {
    if (status === "SETTLED" || status === "VERIFIED") return "ok";
    if (status === "REJECTED" || status === "EXPIRED" || status === "CANCELLED" || status === "REFUNDED") return "bad";
    return "warn";
  };
  function render() {
    var out = (window.openai && window.openai.toolOutput) || {};
    var v = out.verification || out;
    var lang = (window.openai && window.openai.locale && String(window.openai.locale).indexOf("ja") === 0) ? "ja" : "en";
    var summary = v.summary ? (v.summary[lang] || v.summary.en || "") : "";
    var r = v.result || null;
    var html = "";
    if (out.quote_id && !v.verification_id) {
      html += '<div class="head"><span class="pill warn">' + (lang === "ja" ? "見積もり" : "Quote") + '</span></div>';
      html += '<div class="answer">' + esc(out.total) + ' ' + esc(out.bounty && out.bounty.asset) + '</div>';
      html += '<p class="muted">' + (lang === "ja" ? "まだ何も引き当てていません。承認すると依頼が作られます。残高の見込み: " : "Nothing reserved yet. Confirm to create the request. Balance after: ") + esc(out.balance_after) + '</p>';
    } else {
      html += '<div class="head"><span class="pill ' + pillClass(v.status) + '">' + esc(v.status || "…") + '</span>';
      if (v.type) html += '<span class="muted">' + esc(v.type) + '</span>';
      html += '</div>';
      if (v.question) html += '<p class="muted">' + esc(v.question) + '</p>';
      if (r && r.answer != null) {
        var ans = (r.answers && r.answers.length) ? r.answers.join(" / ") : r.answer;
        html += '<div class="answer">' + esc(ans) + '</div>';
      }
      if (summary) html += '<p>' + esc(summary) + '</p>';
      if (r && r.reviews && r.reviews.length) {
        html += '<div class="box"><h4>' + (lang === "ja" ? "AI の照合" : "AI review") + '</h4><ul>';
        for (var i = 0; i < r.reviews.length; i++) {
          var rv = r.reviews[i];
          html += '<li><b>' + esc(rv.verdict) + '</b>' + (rv.reason ? ': ' + esc(rv.reason) : '') + '</li>';
        }
        html += '</ul></div>';
      }
      if (r && r.proof && r.proof.url) {
        html += '<a class="proof" href="' + esc(r.proof.url) + '" target="_blank" rel="noopener">' +
          (lang === "ja" ? "人が確かめた記録を見る" : "See the human-verified proof") + '</a>';
      }
      if (out.note && !r) html += '<p class="muted">' + esc(out.note) + '</p>';
    }
    document.getElementById("root").innerHTML = html;
  }
  render();
  window.addEventListener("openai:set_globals", render);
})();
</script>
</body>
</html>
`;
