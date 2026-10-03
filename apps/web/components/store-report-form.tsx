"use client";
// S-B09 店舗からの申告フォーム. Posts to /v1/store/{token} (01 §4.13).
import { useState } from "react";

type Current = { status: "CLOSED_TODAY" | "OPEN_AS_USUAL"; reported_at: string; valid_until: string } | null;
const LABEL: Record<NonNullable<Current>["status"], string> = {
  CLOSED_TODAY: "本日は臨時休業",
  OPEN_AS_USUAL: "通常どおり営業",
};
/** "10/4 の終わりまで" for a JST midnight, otherwise the date and time. */
function until(iso: string) {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
  if (hm === "00:00") {
    const day = new Date(d.getTime() - 1).toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
    });
    return `${day} の終わりまで`;
  }
  return `${d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} まで`;
}

export function StoreReportForm({ token, initial }: { token: string; initial: Current }) {
  const [current, setCurrent] = useState<Current>(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(status: NonNullable<Current>["status"]) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/v1/store/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, note: note.trim() || undefined }),
    }).catch(() => null);
    if (res?.ok) {
      setCurrent(((await res.json()) as { current: Current }).current);
      setNote("");
    } else {
      setErr("送れませんでした。少し待ってからもう一度お試しください。");
    }
    setBusy(false);
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
        <p className="text-slate-500">いまの申告</p>
        {current ? (
          <p className="mt-1">
            <span className="text-lg font-bold">{LABEL[current.status]}</span>
            <span className="ml-2 text-slate-500">{until(current.valid_until)}</span>
          </p>
        ) : (
          <p className="mt-1 text-slate-600">申告はありません。</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => send("CLOSED_TODAY")}
          className="rounded-2xl bg-slate-800 px-4 py-4 font-bold text-white disabled:opacity-40"
        >
          本日は臨時休業
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => send("OPEN_AS_USUAL")}
          className="rounded-2xl bg-teal-700 px-4 py-4 font-bold text-white disabled:opacity-40"
        >
          通常どおり営業
        </button>
      </div>
      <div>
        <label htmlFor="note" className="text-sm font-semibold">
          運営者へのメモ（任意・公開されません）
        </label>
        <input
          id="note"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
      </div>
      {err ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</p> : null}
    </div>
  );
}
