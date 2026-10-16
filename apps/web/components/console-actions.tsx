"use client";
// Console client bits: sign-in form, sign-out, stop-schedule and deposit buttons (01 §4.14, 15 §4.3).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";

export function ConsoleLoginForm() {
  const lang = useLang();
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
      router.replace(langHref(lang, "/console"));
      router.refresh();
      return;
    }
    const code = res ? ((await res.json().catch(() => null)) as { error?: { code?: string } } | null) : null;
    setErr(
      code?.error?.code === "CREDENTIAL_SUSPENDED"
        ? pick(
            lang,
            "この API キーは止められています。運営者に問い合わせてください。",
            "This API key has been suspended. Please contact the operator.",
          )
        : code?.error?.code === "RATE_LIMITED"
          ? pick(
              lang,
              "短い時間に何度も試しています。1分ほど待ってください。",
              "Too many attempts. Please wait a minute.",
            )
          : pick(lang, "API キーを確かめてください。", "Please check the API key."),
    );
  }
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <label htmlFor="key" className="text-sm font-semibold">
        {pick(lang, "API キー（pm_test_ で始まる文字列）", "API key (starts with pm_test_)")}
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
        {pick(
          lang,
          "キーはこの画面にもブラウザにも残しません。確かめたあとは12時間有効なログイン状態だけを持ちます。",
          "The key is kept neither on this page nor in the browser. After it is checked, only a 12-hour session remains.",
        )}
      </p>
      {err ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</p> : null}
      <button
        type="submit"
        disabled={busy || !key.trim()}
        className="w-full rounded-2xl bg-teal-700 px-4 py-4 font-bold text-white disabled:opacity-40"
      >
        {busy ? pick(lang, "確かめています…", "Checking…") : pick(lang, "ログイン", "Sign in")}
      </button>
    </form>
  );
}

export function LogoutButton() {
  const lang = useLang();
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/v1/console/logout", { method: "POST" }).catch(() => null);
        router.replace(langHref(lang, "/console/login"));
        router.refresh();
      }}
      className="rounded-full px-4 py-1.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-700"
    >
      {pick(lang, "ログアウト", "Sign out")}
    </button>
  );
}

export function StopScheduleButton({ id }: { id: string }) {
  const lang = useLang();
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
      {pick(lang, "止める", "Stop")}
    </button>
  );
}

export function CreateDepositButton() {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/v1/console/deposit", { method: "POST" }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
      className="rounded-2xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-40"
    >
      {busy
        ? pick(lang, "発行しています…", "Issuing…")
        : pick(lang, "入金先を発行する", "Get a deposit address")}
    </button>
  );
}

/** A value to copy: monospace, wraps, with a copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const lang = useLang();
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <code className="break-all text-xs">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => null);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          className="shrink-0 text-xs font-semibold text-teal-700 underline"
        >
          {done ? pick(lang, "コピーした", "Copied") : pick(lang, "コピー", "Copy")}
        </button>
      </div>
    </div>
  );
}

/** General tasks (docs/architecture 13 §8): accept or decline an applicant from the console. */
export function TaskApplicationButtons({ taskId, appId }: { taskId: string; appId: string }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (action: "accept" | "reject") => {
    setBusy(true);
    await fetch(`/v1/console/tasks/${taskId}/applications/${appId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  };
  return (
    <span className="flex gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => act("accept")}
        className="rounded-xl bg-teal-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {pick(lang, "採用する", "Accept")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("reject")}
        className="text-sm font-semibold text-slate-600 underline disabled:opacity-40"
      >
        {pick(lang, "見送る", "Decline")}
      </button>
    </span>
  );
}

/** Release, send back or reject a delivered seat. Releasing is final, so it asks first. */
export function TaskSeatButtons({ taskId, seatId }: { taskId: string; seatId: string }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (action: "release" | "request-changes" | "reject") => {
    let body: Record<string, unknown> = {};
    if (action === "release") {
      if (
        !window.confirm(
          pick(lang, "支払います。取り消せません。よろしいですか。", "Pay now? This cannot be undone."),
        )
      )
        return;
      body = { acknowledge_release: true };
    } else {
      const reason = window.prompt(
        action === "reject"
          ? pick(
              lang,
              "受け取らない理由（worker に見えます）",
              "Why you are rejecting it (the worker sees this)",
            )
          : pick(lang, "直してほしいところ（worker に見えます）", "What to change (the worker sees this)"),
      );
      if (!reason?.trim()) return;
      body = { reason: reason.trim() };
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/v1/console/tasks/${taskId}/seats/${seatId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok)
      setErr(
        pick(lang, "うまくいきませんでした。読み込み直してください。", "That did not work. Reload the page."),
      );
    router.refresh();
  };
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => act("release")}
        className="rounded-xl bg-teal-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {pick(lang, "承認して支払う", "Approve and pay")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("request-changes")}
        className="text-sm font-semibold text-teal-800 underline disabled:opacity-40"
      >
        {pick(lang, "直しを頼む", "Ask for changes")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("reject")}
        className="text-sm font-semibold text-rose-700 underline disabled:opacity-40"
      >
        {pick(lang, "受け取らない", "Reject")}
      </button>
      {err ? <span className="text-sm text-rose-700">{err}</span> : null}
    </span>
  );
}

/** Reply to the worker on a seat from the console. */
export function TaskMessageForm({ taskId, seatId }: { taskId: string; seatId: string }) {
  const lang = useLang();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        await fetch(`/v1/console/tasks/${taskId}/seats/${seatId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: text.trim() }),
        }).catch(() => null);
        setBusy(false);
        setText("");
        router.refresh();
      }}
    >
      <input
        className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={pick(lang, "worker へのメッセージ", "Message to the worker")}
      />
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="rounded-xl border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-800 disabled:opacity-40"
      >
        {pick(lang, "送る", "Send")}
      </button>
    </form>
  );
}
