"use client";
// W-01 ログイン — Privy のメール / Google ログイン（DEV_MODE では名前だけ）。
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useSession } from "@/lib/client/auth";
import { useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";

export default function LoginPage() {
  const lang = useLang();
  const s = useSession();
  const [name, setName] = useState("");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-white p-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-teal-700">ProofMarket</p>
        <h1 className="text-3xl font-bold leading-tight">
          {pick(
            lang,
            "近くのお店の「いま」を確かめて、報酬を受け取る",
            "Check what's happening at shops near you, and get paid",
          )}
        </h1>
        <p className="text-slate-600">
          {pick(
            lang,
            "AI からの確認依頼に、現地の写真と回答で応えます。1件あたり数分で終わります。",
            "Answer verification requests from AI with a photo and an answer from the spot. Each one takes a few minutes.",
          )}
        </p>
      </div>
      {s.isDev ? (
        <Card>
          <label className="block text-sm font-medium text-slate-600" htmlFor="devname">
            {pick(lang, "開発モード: 名前を入れてログイン", "Dev mode: enter a name to sign in")}
          </label>
          <input
            id="devname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="alice"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
          />
          <div className="mt-3">
            <Button onClick={() => s.login(name)} disabled={!name.trim()}>
              {pick(lang, "ログイン", "Sign in")}
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={() => s.login()}>
          {pick(lang, "メールまたは Google でログイン", "Sign in with email or Google")}
        </Button>
      )}
      <p className="text-xs text-slate-500">
        {pick(
          lang,
          "招待された方だけが参加できるテスト運用です。",
          "This is a pilot; only invited people can take part.",
        )}
      </p>
    </div>
  );
}
