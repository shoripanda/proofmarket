"use client";
// S-08 removal request form. Posts to /v1/public/removal-requests (04 §3.21).
import { useState } from "react";

export function RemovalForm() {
  const [email, setEmail] = useState("");
  const [vid, setVid] = useState("");
  const [place, setPlace] = useState("");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/v1/public/removal-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        verification_id: vid.trim() || undefined,
        place_note: place.trim() || undefined,
        reason,
        website: website || undefined,
      }),
    }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl bg-emerald-50 p-6 text-emerald-900 ring-1 ring-emerald-200">
        <p className="font-bold">受け付けました。</p>
        <p className="mt-1 text-sm leading-relaxed">
          運営者が内容を確かめ、1営業日を目安に対応して、入力したメールアドレスに結果をお知らせします。
        </p>
      </div>
    );
  }
  const input = "mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base";
  return (
    <form onSubmit={submit} className="max-w-xl space-y-5">
      <div>
        <label htmlFor="r-email" className="text-sm font-semibold">
          連絡先のメールアドレス
        </label>
        <input
          id="r-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="r-vid" className="text-sm font-semibold">
          結果ページの ID（分かれば）
        </label>
        <input
          id="r-vid"
          placeholder="ver_..."
          value={vid}
          onChange={(e) => setVid(e.target.value)}
          className={`${input} font-mono`}
        />
      </div>
      <div>
        <label htmlFor="r-place" className="text-sm font-semibold">
          店舗名や場所（任意）
        </label>
        <input
          id="r-place"
          maxLength={200}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="r-reason" className="text-sm font-semibold">
          どうしてほしいか
        </label>
        <textarea
          id="r-reason"
          required
          maxLength={1000}
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例: 店内の客が写っているので、写真を消してほしい"
          className={input}
        />
      </div>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="r-website">Website</label>
        <input
          id="r-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        メールアドレスはこの依頼への連絡にだけ使い、暗号化して保存します。対応の記録として1年間残し、その後に消します。
      </p>
      {state === "error" ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          送れませんでした。入力を確かめて、少し待ってからもう一度送ってください。
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!email || !reason.trim() || state === "busy"}
        className="w-full rounded-2xl bg-teal-700 px-4 py-4 text-base font-bold text-white disabled:opacity-40"
      >
        {state === "busy" ? "送っています…" : "削除を依頼する"}
      </button>
    </form>
  );
}
