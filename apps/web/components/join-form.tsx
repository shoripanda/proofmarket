"use client";
// S-04 /join form. Posts to /v1/public/participation-requests (04 §3.20).
import { useState } from "react";

type Role = "worker" | "requester";

export function JoinForm({ initialRole }: { initialRole: Role }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("shibuya");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
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
      }),
    }).catch(() => null);
    if (res?.ok) {
      setState("done");
      return;
    }
    const code = res ? ((await res.json().catch(() => null)) as { error?: { code?: string } } | null) : null;
    setMsg(
      code?.error?.code === "RATE_LIMITED"
        ? "短い時間に何度も送られています。1分ほど待ってから送ってください。"
        : code?.error?.code === "VALIDATION_FAILED"
          ? "入力を確かめてください。メールアドレスの形と、同意のチェックが必要です。"
          : "送れませんでした。通信の状態を確かめて、もう一度送ってください。",
    );
    setState("error");
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl bg-emerald-50 p-6 text-emerald-900 ring-1 ring-emerald-200">
        <p className="font-bold">受け付けました。</p>
        <p className="mt-1 text-sm leading-relaxed">
          運営者が内容を確かめて、入力したメールアドレスに連絡します。試験運用中のため、すぐにはお返事できないことがあります。
        </p>
      </div>
    );
  }

  const input = "mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base";
  return (
    <form onSubmit={submit} className="max-w-xl space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold">申し込みの種類</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["worker", "worker として参加したい", "招待コードを受け取る"],
              ["requester", "エージェントからつなぎたい", "API キーを受け取る"],
            ] as const
          ).map(([v, label, sub]) => (
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
              <span className="block text-xs text-slate-500">{sub}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="email" className="text-sm font-semibold">
          メールアドレス
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
            よく行く場所
          </label>
          <select id="area" value={area} onChange={(e) => setArea(e.target.value)} className={input}>
            <option value="shibuya">渋谷のあたり</option>
            <option value="shinjuku">新宿のあたり</option>
            <option value="other">それ以外の東京都心</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            おおまかな地域だけを聞きます。住所は書かないでください。
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="note" className="text-sm font-semibold">
          {role === "worker" ? "ひとこと（任意）" : "どんなエージェントで使いたいか（任意）"}
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
          メールアドレスは、この申し込みへの連絡にだけ使います。暗号化して保存し、90日で消します。この扱いに同意します。
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
        {state === "busy" ? "送っています…" : "申し込む"}
      </button>
    </form>
  );
}
