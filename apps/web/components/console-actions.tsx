"use client";
// Console client bits: sign-in form, sign-out and stop-schedule buttons (01 §4.14).
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConsoleLoginForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/v1/console/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: key }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setKey("");
      router.replace("/console");
      router.refresh();
      return;
    }
    const code = res ? ((await res.json().catch(() => null)) as { error?: { code?: string } } | null) : null;
    setErr(
      code?.error?.code === "CREDENTIAL_SUSPENDED"
        ? "この API キーは止められています。運営者に問い合わせてください。"
        : code?.error?.code === "RATE_LIMITED"
          ? "短い時間に何度も試しています。1分ほど待ってください。"
          : "API キーを確かめてください。",
    );
  }
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <label htmlFor="key" className="text-sm font-semibold">
        API キー（pm_test_ で始まる文字列）
      </label>
      <input
        id="key"
        type="password"
        autoComplete="off"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono"
      />
      <p className="text-xs leading-relaxed text-slate-500">
        キーはこの画面にもブラウザにも残しません。確かめたあとは12時間有効なログイン状態だけを持ちます。
      </p>
      {err ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</p> : null}
      <button
        type="submit"
        disabled={busy || !key.trim()}
        className="w-full rounded-2xl bg-teal-700 px-4 py-4 font-bold text-white disabled:opacity-40"
      >
        {busy ? "確かめています…" : "ログイン"}
      </button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/v1/console/logout", { method: "POST" }).catch(() => null);
        router.replace("/console/login");
        router.refresh();
      }}
      className="rounded-full px-4 py-1.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-700"
    >
      ログアウト
    </button>
  );
}

export function StopScheduleButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/v1/console/schedules/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(
          () => null,
        );
        setBusy(false);
        router.refresh();
      }}
      className="text-sm font-semibold text-rose-700 underline disabled:opacity-40"
    >
      止める
    </button>
  );
}
