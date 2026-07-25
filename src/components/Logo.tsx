import Link from "next/link";

/** Own-drawn plane glyph + wordmark. */
export default function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Soar home"
      className="flex items-center gap-2.5 text-white transition hover:opacity-90"
    >
      <svg viewBox="0 0 32 32" fill="none" className="size-8">
        <path
          d="M3 21.5l25.5-11-8.5 13-3.5-6.5-7 2 3.5-4.5L3 21.5z"
          fill="currentColor"
        />
        <path
          d="M20 23.5l2.5 2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      {withWordmark && (
        <span className="text-[22px] font-bold tracking-tight">Soar</span>
      )}
    </Link>
  );
}
