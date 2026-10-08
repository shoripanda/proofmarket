"use client";
// S-07 「Solana で確かめる」: reads the Task account from public Devnet in the visitor's browser and compares it
// with what this page shows, so the check does not depend on trusting ProofMarket's server.
import { useState } from "react";
import { useLang } from "@/lib/client/lang";
import { type CheckItem, compare, fetchAccount } from "@/lib/client/onchain-check";
import { pick } from "@/lib/lang";

const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";

export function OnchainCheck(p: {
  verificationId: string;
  status: string;
  evidenceRoot: string;
  resultHash: string;
  taskAccount: string;
  programId: string;
}) {
  const lang = useLang();
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function run() {
    setState("busy");
    try {
      const acc = await fetchAccount(PUBLIC_DEVNET_RPC, p.taskAccount);
      setItems(await compare(p, acc, p.programId, lang));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const allOk = items?.every((i) => i.ok);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {state === "busy"
          ? pick(lang, "Solana から読んでいます…", "Reading from Solana…")
          : pick(lang, "Solana の記録と照らし合わせる", "Compare with the record on Solana")}
      </button>
      <p className="text-xs leading-relaxed text-slate-500">
        {pick(
          lang,
          `このブラウザから公開の Devnet（${PUBLIC_DEVNET_RPC}）に直接問い合わせます。ProofMarket のサーバーは通りません。`,
          `Your browser queries the public Devnet (${PUBLIC_DEVNET_RPC}) directly. ProofMarket's server is not involved.`,
        )}
      </p>
      {state === "error" ? (
        <p className="text-sm text-rose-700">
          {pick(
            lang,
            "Solana から口座を読めませんでした。少し待ってからもう一度試してください。",
            "Could not read the account from Solana. Please wait a moment and try again.",
          )}
        </p>
      ) : null}
      {items ? (
        <div
          className={`rounded-xl p-4 text-sm ring-1 ${allOk ? "bg-emerald-50 ring-emerald-200" : "bg-rose-50 ring-rose-200"}`}
        >
          <p className="font-bold">
            {allOk
              ? pick(
                  lang,
                  "このページの内容は、Solana の記録と一致しています。",
                  "This page matches the record on Solana.",
                )
              : pick(lang, "一致しない項目があります。", "Some items do not match.")}
          </p>
          <ul className="mt-2 space-y-1">
            {items.map((i) => (
              <li key={i.label}>
                <span className={i.ok ? "text-emerald-700" : "text-rose-700"}>
                  {i.ok ? pick(lang, "一致", "match") : pick(lang, "不一致", "mismatch")}
                </span>
                <span className="ml-2">{i.label}</span>
                <span className="block break-all font-mono text-xs text-slate-500">{i.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
