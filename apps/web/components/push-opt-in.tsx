"use client";
// B-01 プッシュ通知の受け取り設定 (04 §3.22). The worker picks coarse areas; their location is never sent.
import { useCallback, useEffect, useState } from "react";
import { errorText, useApi } from "@/lib/client/api";
import { Button, Card, Notice } from "./ui";

const AREAS = [
  ["shibuya", "渋谷のあたり"],
  ["shinjuku", "新宿のあたり"],
  ["other", "それ以外の東京都心"],
] as const;
type Area = (typeof AREAS)[number][0];
const STORE = "pm.push.areas";
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "unsupported" | "install" | "off" | "on" | "denied" | "unavailable";

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function readAreas(): Area[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function PushOptIn() {
  const api = useApi();
  const [state, setState] = useState<State>("loading");
  const [areas, setAreas] = useState<Area[]>(["shibuya"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const init = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      setState(ios ? "install" : "unsupported");
      return;
    }
    if (!VAPID) return setState("unavailable");
    const s = await api<{ available: boolean }>("/v1/worker/push-subscription").catch(() => null);
    if (!s?.available) return setState("unavailable");
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    const saved = readAreas();
    if (saved.length) setAreas(saved);
    setState(sub ? "on" : "off");
  }, [api]);

  useEffect(() => {
    init().catch(() => setState("unsupported"));
  }, [init]);

  async function enable() {
    setBusy(true);
    setErr(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(VAPID),
          });
        } catch {
          setErr(
            "このブラウザでは通知を登録できませんでした。Chrome か Safari（ホーム画面に追加したもの）で試してください。",
          );
          return;
        }
      }
      await api("/v1/worker/push-subscription", {
        method: "PUT",
        body: { subscription: sub.toJSON(), areas },
      });
      try {
        localStorage.setItem(STORE, JSON.stringify(areas));
      } catch {}
      setState("on");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setErr(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/v1/worker/push-subscription", { method: "DELETE", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported" || state === "unavailable") return null;
  if (state === "install") {
    return (
      <Notice>
        iPhone
        で新しい依頼の通知を受け取るには、共有ボタンから「ホーム画面に追加」をして、ホーム画面のアイコンから開いてください。
      </Notice>
    );
  }
  if (state === "denied") {
    return (
      <Notice>
        通知がブロックされています。受け取るときは、ブラウザの設定でこのサイトの通知を許可してください。
      </Notice>
    );
  }
  const toggle = (a: Area) => setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  return (
    <Card>
      <h2 className="font-bold">{state === "on" ? "新しい依頼を通知中" : "新しい依頼を通知で受け取る"}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        選んだ地域で依頼が出たら、画面を閉じていても通知します。今いる場所は送りません。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {AREAS.map(([a, label]) => (
          <button
            key={a}
            type="button"
            onClick={() => toggle(a)}
            disabled={busy}
            aria-pressed={areas.includes(a)}
            className={`rounded-full px-3 py-1.5 text-sm ring-1 ${areas.includes(a) ? "bg-teal-700 text-white ring-teal-700" : "text-slate-700 ring-slate-300"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {err ? (
        <div className="mt-3">
          <Notice tone="error">{err}</Notice>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        <Button onClick={enable} disabled={busy || areas.length === 0}>
          {state === "on" ? "地域を保存する" : "通知を受け取る"}
        </Button>
        {state === "on" ? (
          <Button variant="secondary" onClick={disable} disabled={busy}>
            通知を止める
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
