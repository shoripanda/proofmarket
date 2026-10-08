import "server-only";
// Resend adapter (01 §4.28). Plain fetch to the HTTP API, no SDK. Created only when RESEND_API_KEY and
// MAIL_FROM are set. The provider's error text is kept short and never includes the address or the body.
import type { Mailer } from "../ports";

export function createResendMailer(o: { apiKey: string; from: string; fetch?: typeof fetch }): Mailer {
  const f = o.fetch ?? fetch;
  return {
    async send(m) {
      try {
        const res = await f("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ from: o.from, to: [m.to], subject: m.subject, text: m.text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true };
        const body = (await res.json().catch(() => null)) as { name?: string } | null;
        return { ok: false, reason: `resend ${res.status}${body?.name ? ` ${body.name}` : ""}` };
      } catch (e) {
        return { ok: false, reason: `resend unreachable: ${(e as Error).name}` };
      }
    },
  };
}
