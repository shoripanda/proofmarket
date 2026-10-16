"use client";
// The seat's conversation with the requester (docs/architecture 13 §5.2).
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";

interface Message {
  message_id: string;
  sender: "requester" | "worker";
  body: string;
  flags: string[];
  created_at: string;
}

export function SeatMessages({ seatId }: { seatId: string }) {
  const lang = useLang();
  const api = useApi();
  const [list, setList] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api<{ messages: Message[] }>(`/v1/worker/market-seats/${seatId}/messages`).then(
        (r) => setList(r.messages),
        (e) => setErr(errorText(e, lang)),
      ),
    [api, seatId, lang],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function send() {
    setErr(null);
    try {
      const r = await api<{ messages: Message[] }>(`/v1/worker/market-seats/${seatId}/messages`, {
        method: "POST",
        body: { body: text.trim() },
      });
      setList(r.messages);
      setText("");
    } catch (e) {
      setErr(errorText(e, lang));
    }
  }
  return (
    <Card>
      <p className="text-sm font-bold text-slate-500">
        {pick(lang, "依頼者とのやりとり", "Messages with the requester")}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {pick(
          lang,
          "連絡先の交換や、ProofMarket の外での支払いの話はしないでください。",
          "Do not exchange contact details or arrange payment outside ProofMarket.",
        )}
      </p>
      <ul className="mt-3 space-y-2">
        {list.map((m) => (
          <li
            key={m.message_id}
            className={`whitespace-pre-wrap rounded-xl p-3 text-sm ${
              m.sender === "worker" ? "ml-8 bg-teal-50 text-teal-950" : "mr-8 bg-slate-100"
            }`}
          >
            {m.body}
          </li>
        ))}
      </ul>
      {err ? <Notice tone="error">{err}</Notice> : null}
      <textarea
        className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-base"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={pick(lang, "質問や途中経過", "A question or progress")}
      />
      <div className="mt-2">
        <Button variant="secondary" onClick={send} disabled={!text.trim()}>
          {pick(lang, "送る", "Send")}
        </Button>
      </div>
    </Card>
  );
}
