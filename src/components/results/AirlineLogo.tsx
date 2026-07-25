"use client";

import { useState } from "react";

/**
 * Airline logo with graceful fallback chain:
 * gstatic (Google's airline logos by IATA code) → pics.avs.io → initials.
 */
export default function AirlineLogo({
  carrierCode,
  carrierName,
  logoUrl,
}: {
  carrierCode: string;
  carrierName: string;
  logoUrl?: string;
}) {
  const candidates = [
    ...(logoUrl ? [logoUrl] : []),
    `https://www.gstatic.com/flights/airline_logos/70px/${carrierCode}.png`,
    `https://pics.avs.io/60/60/${carrierCode}.png`,
  ];
  const [idx, setIdx] = useState(0);

  if (idx >= candidates.length || !carrierCode) {
    return (
      <div className="flex size-11 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-slate-200">
        {(carrierCode || carrierName.slice(0, 2)).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[idx]}
      alt={carrierName}
      className="size-11 rounded-lg object-contain"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
