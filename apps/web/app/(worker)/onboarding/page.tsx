"use client";
// W-02 First-time registration — invite code, consent to the terms, safety rules and privacy, and an explanation of location and camera use.
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button, Card, Notice, Shell, safetyNotes } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";
import { LEGAL_VERSIONS } from "@/lib/legal";

export default function OnboardingPage() {
  const lang = useLang();
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
          consents: {
            worker_terms: LEGAL_VERSIONS.worker_terms,
            safety_rules: LEGAL_VERSIONS.safety_rules,
            privacy_notice: LEGAL_VERSIONS.privacy_notice,
          },
        },
      });
      router.replace(langHref(lang, "/tasks"));
    } catch (e) {
      setErr(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  const box = (key: keyof typeof agree, label: ReactNode) => (
    <label className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-teal-700"
        checked={agree[key]}
        onChange={(e) => setAgree({ ...agree, [key]: e.target.checked })}
      />
      <span className="text-sm leading-relaxed">{label}</span>
    </label>
  );
  const link = (href: string, text: string) => (
    <a
      href={langHref(lang, href)}
      target="_blank"
      className="font-semibold text-teal-700 underline"
      rel="noopener"
    >
      {text}
    </a>
  );

  return (
    <Shell title={pick(lang, "はじめに", "Getting started")}>
      <Card>
        <label htmlFor="code" className="text-sm font-medium text-slate-600">
          {pick(lang, "招待コード", "Invite code")}
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
        <h2 className="mb-2 font-bold">{pick(lang, "安全のために", "For your safety")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {safetyNotes(lang).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>
      <Card>
        {box(
          "terms",
          lang === "en" ? (
            <>I agree to the {link("/legal/worker-terms", "worker terms")}</>
          ) : (
            <>
              {link("/legal/worker-terms", "参加規約")}
              に同意します
            </>
          ),
        )}
        {box("safety", pick(lang, "上の安全ルールを守ります", "I will follow the safety rules above"))}
        {box(
          "privacy",
          lang === "en" ? (
            <>
              I understand how photos, location and the payout address are handled (
              {link("/legal/privacy", "privacy policy")})
            </>
          ) : (
            <>
              写真・位置・受取アドレスの扱い（{link("/legal/privacy", "プライバシーポリシー")}）を理解しました
            </>
          ),
        )}
      </Card>
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Button onClick={submit} disabled={!all || busy}>
        {busy ? pick(lang, "登録中…", "Registering…") : pick(lang, "登録して始める", "Register and start")}
      </Button>
    </Shell>
  );
}
