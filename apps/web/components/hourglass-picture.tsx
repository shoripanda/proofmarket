// An hourglass as a line drawing: the challenge window of an optimistic answer (13 §3, /r/{id}).
// Decorative; the sentence next to it carries the meaning. `done` empties the top bulb.
export function HourglassPicture({ done = true, className = "" }: { done?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 6h28M10 58h28" className="text-slate-500" />
      <path d="M13 6c0 15 9 20 9 26s-9 11-9 26M35 6c0 15-9 20-9 26s9 11 9 26" className="text-slate-400" />
      {done ? null : (
        <path d="M16 12h16c-1 6-5 10-8 13-3-3-7-7-8-13z" className="fill-amber-200 text-amber-500" />
      )}
      <path d="M24 33v9" className="text-amber-500" strokeDasharray="1 3" />
      <path
        d={done ? "M15 56c1-7 6-12 9-12s8 5 9 12z" : "M18 56c1-4 4-6 6-6s5 2 6 6z"}
        className="fill-amber-200 text-amber-500"
      />
    </svg>
  );
}
