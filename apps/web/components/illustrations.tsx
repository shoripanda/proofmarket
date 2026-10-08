// Line drawings for the beginner pages (13 §7): one picture per idea, readable with every word hidden.
// Stroke-only SVG in two colours, 160×120, so they sit next to a heading on a phone. Plain-words aware through <Plain>.
import type { ReactNode } from "react";
import { Plain } from "@/lib/client/plain";

export type PictureKey = "camera" | "checks" | "agree" | "ledger" | "limits" | "signup" | "nearby" | "paid";

const INK = "#334155";
const TEAL = "#0f766e";

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 160 120"
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label={label}
      fill="none"
      stroke={INK}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{label}</title>
      {children}
    </svg>
  );
}

/** A phone in portrait; children are drawn on its screen (screen is x 52–108, y 18–98). */
function Phone({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect x="46" y="8" width="68" height="104" rx="10" />
      <path d="M72 102h16" />
      {children}
    </>
  );
}

const DRAW: Record<PictureKey, { ja: string; en: string; body: ReactNode }> = {
  camera: {
    ja: "アプリの中のカメラ",
    en: "The camera inside the app",
    body: (
      <>
        <Phone>
          <rect x="54" y="22" width="52" height="58" rx="3" stroke={TEAL} />
          <path d="M60 28h8M60 28v8M100 28h-8M100 28v8M60 74h8M60 74v-8M100 74h-8M100 74v-8" stroke={TEAL} />
          <circle cx="80" cy="51" r="9" stroke={TEAL} />
        </Phone>
        <circle cx="80" cy="91" r="6" fill={TEAL} stroke={TEAL} />
        <path d="M22 40l12 6M18 60h14M22 80l12-6" />
        <path d="M138 40l-12 6M142 60h-14M138 80l-12-6" />
      </>
    ),
  },
  checks: {
    ja: "順番に確かめる",
    en: "Checked one by one",
    body: (
      <>
        <rect x="30" y="10" width="100" height="100" rx="8" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x="42" y={22 + i * 22} width="14" height="14" rx="3" stroke={i < 3 ? TEAL : INK} />
            {i < 3 ? <path d={`M45 ${29 + i * 22}l3 3 6-7`} stroke={TEAL} /> : null}
            <path d={`M64 ${29 + i * 22}h${i === 3 ? 30 : 52}`} />
          </g>
        ))}
        <circle cx="118" cy="95" r="12" fill="#ffffff" stroke={TEAL} />
        <path d="M112 95l4 4 8-8" stroke={TEAL} />
      </>
    ),
  },
  agree: {
    ja: "2 人の答えがそろう",
    en: "Two answers agree",
    body: (
      <>
        <circle cx="36" cy="66" r="10" />
        <path d="M20 108a16 16 0 0 1 32 0" />
        <circle cx="124" cy="66" r="10" />
        <path d="M108 108a16 16 0 0 1 32 0" />
        <rect x="12" y="12" width="48" height="30" rx="8" stroke={TEAL} />
        <path d="M30 42l-4 8 10-8" stroke={TEAL} />
        <path d="M27 27l6 6 11-12" stroke={TEAL} />
        <rect x="100" y="12" width="48" height="30" rx="8" stroke={TEAL} />
        <path d="M130 42l4 8-10-8" stroke={TEAL} />
        <path d="M115 27l6 6 11-12" stroke={TEAL} />
        <path d="M66 27h28" strokeDasharray="4 6" stroke={TEAL} />
        <path d="M74 78h12M74 86h12" strokeWidth="4" stroke={TEAL} />
      </>
    ),
  },
  ledger: {
    ja: "書き換えられない台帳",
    en: "A ledger no one can rewrite",
    body: (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={14 + i * 46} y="34" width="36" height="44" rx="4" stroke={i === 2 ? TEAL : INK} />
            <path
              d={`M${22 + i * 46} 48h20M${22 + i * 46} 58h20M${22 + i * 46} 68h12`}
              stroke={i === 2 ? TEAL : INK}
            />
            {i < 2 ? <path d={`M${50 + i * 46} 56h10`} /> : null}
          </g>
        ))}
        <rect x="124" y="70" width="24" height="20" rx="3" fill="#ffffff" stroke={TEAL} />
        <path d="M129 70v-6a7 7 0 0 1 14 0v6" stroke={TEAL} />
        <circle cx="136" cy="80" r="2" fill={TEAL} stroke={TEAL} />
      </>
    ),
  },
  limits: {
    ja: "確かめられることと、確かめられないこと",
    en: "What can and cannot be checked",
    body: (
      <>
        <circle cx="66" cy="54" r="30" />
        <path d="M88 76l26 26" strokeWidth="6" />
        <path d="M54 54l8 8 16-18" stroke={TEAL} />
        <path d="M120 22v18M120 50v1" stroke="#b45309" strokeWidth="4" />
      </>
    ),
  },
  signup: {
    ja: "スマホで登録",
    en: "Sign up on your phone",
    body: (
      <Phone>
        <circle cx="80" cy="40" r="9" stroke={TEAL} />
        <path d="M66 64a14 14 0 0 1 28 0" stroke={TEAL} />
        <rect x="58" y="72" width="44" height="12" rx="6" fill={TEAL} stroke={TEAL} />
      </Phone>
    ),
  },
  nearby: {
    ja: "近くの依頼",
    en: "Requests nearby",
    body: (
      <>
        <path d="M14 30l40-14 52 14 40-14v76l-40 14-52-14-40 14z" />
        <path d="M54 16v76M106 30v76" strokeDasharray="4 6" />
        <path d="M80 72s-16-16-16-28a16 16 0 0 1 32 0c0 12-16 28-16 28z" fill="#ffffff" stroke={TEAL} />
        <circle cx="80" cy="44" r="5" stroke={TEAL} />
        <circle cx="36" cy="66" r="4" fill={INK} />
        <circle cx="126" cy="52" r="4" fill={INK} />
      </>
    ),
  },
  paid: {
    ja: "撮って答えて受け取る",
    en: "Shoot, answer, get paid",
    body: (
      <>
        <rect x="14" y="40" width="70" height="50" rx="8" />
        <path d="M34 40l6-10h18l6 10" />
        <circle cx="49" cy="65" r="13" stroke={TEAL} />
        <path d="M90 65h14m-6-6 6 6-6 6" />
        <circle cx="130" cy="65" r="20" stroke={TEAL} />
        <circle cx="130" cy="65" r="13" stroke={TEAL} strokeWidth="2" />
        <path d="M130 58v14M126 61h6a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h6" stroke={TEAL} strokeWidth="2" />
      </>
    ),
  },
};

export function Picture({ k, lang }: { k: PictureKey; lang: "ja" | "en" }) {
  const d = DRAW[k];
  return <Frame label={lang === "en" ? d.en : d.ja}>{d.body}</Frame>;
}

/**
 * A section built picture-first: the drawing, the heading and one sentence. Everything else goes in `more`,
 * folded under "くわしく" so the page reads with the pictures alone.
 */
export function PictureSection({
  k,
  lang,
  title,
  line,
  more,
  id,
}: {
  k: PictureKey;
  lang: "ja" | "en";
  title: string;
  line: ReactNode;
  more?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr] sm:gap-8">
        <div className="mx-auto w-40 sm:w-full">
          <Picture k={k} lang={lang} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            <Plain>{title}</Plain>
          </h2>
          <p className="mt-2 text-lg leading-relaxed text-slate-700">
            {typeof line === "string" ? <Plain>{line}</Plain> : line}
          </p>
        </div>
      </div>
      {more ? (
        <details className="group mt-5 rounded-2xl border border-slate-200 p-4 open:bg-slate-50/50">
          <summary className="cursor-pointer select-none text-sm font-semibold text-teal-700">
            {lang === "en" ? "In detail" : "くわしく"}
          </summary>
          <div className="mt-4">{more}</div>
        </details>
      ) : null}
    </section>
  );
}
