"use client";

import { useState } from "react";
import type { ProviderMeta } from "@/lib/types";

const STATUS_ICONS: Record<string, { symbol: string; className: string }> = {
  ok: { symbol: "✓", className: "text-direct" },
  empty: { symbol: "—", className: "text-muted" },
  error: { symbol: "✗", className: "text-stop/80" },
  timeout: { symbol: "✗", className: "text-stop/80" },
  blocked: { symbol: "✗", className: "text-amber-400/80" },
  captcha: { symbol: "✗", className: "text-amber-400/80" },
  disabled: { symbol: "·", className: "text-muted/50" },
};

/**
 * "Searching N more sources…" while streaming; each settled provider becomes
 * a small tick with a hover tooltip explaining its status.
 */
export default function SourcesIndicator({
  providers,
  isStreaming,
}: {
  providers: ProviderMeta[];
  isStreaming: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const pending = providers.filter((p) => p.status === "pending").length;

  return (
    <div className="flex items-center gap-3">
      {isStreaming && pending > 0 && (
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-bright opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-accent-bright" />
          </span>
          Searching {pending} more source{pending > 1 ? "s" : ""}…
        </span>
      )}
      <div className="flex items-center gap-1.5">
        {providers
          .filter((p) => p.status !== "pending")
          .map((p) => {
            const icon = STATUS_ICONS[p.status] ?? STATUS_ICONS.error;
            return (
              <span
                key={p.id}
                className="relative"
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span
                  className={`flex h-6 items-center gap-1 rounded-full bg-white/5 px-2 text-xs ${icon.className}`}
                >
                  {icon.symbol}
                  <span className="text-muted">{p.label}</span>
                </span>
                {hovered === p.id && (
                  <span className="absolute top-full right-0 z-50 mt-1.5 rounded-lg border border-card-border bg-[#0b1428] px-2.5 py-1.5 text-xs whitespace-nowrap text-slate-300 shadow-xl">
                    {p.label}: {p.status}
                  </span>
                )}
              </span>
            );
          })}
      </div>
    </div>
  );
}
