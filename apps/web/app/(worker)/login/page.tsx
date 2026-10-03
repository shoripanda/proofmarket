"use client";
// W-01 ログイン — Privy のメール / Google ログイン（DEV_MODE では名前だけ）。
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useSession } from "@/lib/client/auth";

export default function LoginPage() {
  const s = useSession();
  const [name, setName] = useState("");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-white p-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-teal-700">ProofMarket</p>
        <h1 className="text-3xl font-bold leading-tight">近くのお店の「いま」を確かめて、報酬を受け取る</h1>
        <p className="text-slate-600">
          AI からの確認依頼に、現地の写真と回答で応えます。1件あたり数分で終わります。
        </p>
      </div>
      {s.isDev ? (
        <Card>
          <label className="block text-sm font-medium text-slate-600" htmlFor="devname">
            開発モード: 名前を入れてログイン
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
              ログイン
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={() => s.login()}>メールまたは Google でログイン</Button>
      )}
      <p className="text-xs text-slate-500">招待された方だけが参加できるテスト運用です。</p>
    </div>
  );
}
