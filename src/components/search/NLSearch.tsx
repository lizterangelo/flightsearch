"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toQueryString, type SearchParams } from "@/lib/types";

/**
 * Subtle natural-language search: expands to a one-line input, POSTs to
 * /api/parse-query (Gemini), and jumps straight to results. Pure enhancement.
 */
export default function NLSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as Record<string, unknown> & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not parse that");
      const params: SearchParams = {
        origin: String(data.origin),
        destination: String(data.destination),
        departDate: String(data.departDate),
        returnDate: data.returnDate ? String(data.returnDate) : undefined,
        tripType: data.returnDate ? "round_trip" : "one_way",
        adults: Number(data.adults) || 1,
        cabin: (data.cabin as SearchParams["cabin"]) ?? "economy",
        currency: "USD",
      };
      router.push(`/results?${toQueryString(params)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse that");
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 cursor-pointer text-sm text-muted transition hover:text-slate-300"
      >
        ✨ or describe your trip in words
      </button>
    );
  }

  return (
    <div className="mt-6 w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-full border border-card-border bg-pill/80 py-1.5 pr-1.5 pl-5 backdrop-blur-md">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder='Try "nyc to miami next weekend, 2 people"'
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-muted/70"
          disabled={busy}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !query.trim()}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Parsing…" : "Go"}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-center text-xs text-stop">{error}</div>
      )}
    </div>
  );
}
