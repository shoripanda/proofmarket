"use client";
// W-02 初回登録 — 招待コード、利用規約・安全ルール・プライバシーへの同意、位置とカメラの説明。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Notice, SAFETY_NOTES, Shell } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";

const VERSION = "2026-10-03";

export default function OnboardingPage() {
  const api = useApi();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [agree, setAgree] = useState({ terms: false, safety: false, privacy: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const all = agree.terms && agree.safety && agree.privacy && code.trim().length >= 4;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api("/v1/worker/onboarding", {
        method: "POST",
        body: {
          invite_code: code.trim(),
          consents: { worker_terms: VERSION, safety_rules: VERSION, privacy_notice: VERSION },
        },
      });
      router.replace("/tasks");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const box = (key: keyof typeof agree, label: string) => (
    <label className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        className="mt-1 size-5 accent-teal-700"
        checked={agree[key]}
        onChange={(e) => setAgree({ ...agree, [key]: e.target.checked })}
      />
      <span className="text-sm leading-relaxed">{label}</span>
    </label>
  );

  return (
    <Shell title="はじめに">
      <Card>
        <label htmlFor="code" className="text-sm font-medium text-slate-600">
          招待コード
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="PM-XXXX-XXXX"
          autoCapitalize="characters"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg tracking-wider"
        />
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">安全のために</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {SAFETY_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-1 font-bold">使う機能と記録されること</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          撮影にカメラを、現地にいることの確認に位置情報を使います。写真と正確な位置は運営だけが見られ、30日で消します。
          報酬の受取先アドレスと、どの依頼で受け取ったかは、公開のブロックチェーン上で誰でも見られます。
        </p>
      </Card>
      <Card>
        {box("terms", "参加規約に同意します（引き受けも辞退も自由で、断っても不利益はありません）")}
        {box("safety", "上の安全ルールを守ります")}
        {box("privacy", "写真・位置・受取アドレスの扱いについて理解しました")}
      </Card>
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Button onClick={submit} disabled={!all || busy}>
        {busy ? "登録中…" : "登録して始める"}
      </Button>
    </Shell>
  );
}
