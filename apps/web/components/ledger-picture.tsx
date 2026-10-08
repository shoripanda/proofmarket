// A ledger as a line drawing: rows of entries, one of them lit and linked by a chain (13 §2, /r/{id}).
// Decorative; the sentence next to it carries the meaning.
export function LedgerPicture({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 72"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={6} y={6} width={76} height={60} rx={4} className="text-slate-400" />
      <path d="M18 6v60" className="text-slate-300" />
      <path d="M26 20h46M26 32h46M26 56h46" className="text-slate-300" />
      <rect x={22} y={38} width={54} height={12} rx={2} className="fill-teal-50 text-teal-600" />
      <path d="M28 44h30" className="text-teal-600" />
      {/* the chain icon of flow-diagram.tsx, moved beside the lit row */}
      <path
        transform="translate(88 32)"
        d="M9 15l-3 3a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M15 9l3-3a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0M9 15l6-6"
        className="text-teal-600"
      />
      <path d="M78 44h10" className="text-teal-600" strokeDasharray="2 3" />
    </svg>
  );
}
