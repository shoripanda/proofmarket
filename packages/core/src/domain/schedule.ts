// Recurring checks (04 §3.23): next run time from "HH:MM" times and weekdays in Japan time (UTC+9, no DST).

const JST_MS = 9 * 3600_000;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isHhmm = (s: string) => HHMM.test(s);

/** First instant strictly after `from` that falls on one of `days` (0=Sun) at one of `times` (JST). */
export function nextRunAt(times: readonly string[], days: readonly number[], from: Date): Date {
  const mins = times
    .map((t) => {
      const m = HHMM.exec(t);
      if (!m) throw new Error(`bad time ${t}`);
      return Number(m[1]) * 60 + Number(m[2]);
    })
    .sort((a, b) => a - b);
  if (!mins.length || !days.length) throw new Error("times and days must not be empty");
  const jst = new Date(from.getTime() + JST_MS);
  const dayStartUtc = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_MS;
  for (let d = 0; d <= 7; d++) {
    const start = dayStartUtc + d * 86_400_000;
    const weekday = new Date(start + JST_MS).getUTCDay();
    if (!days.includes(weekday)) continue;
    for (const m of mins) {
      const t = start + m * 60_000;
      if (t > from.getTime()) return new Date(t);
    }
  }
  throw new Error("unreachable: a weekday repeats within 8 days");
}
