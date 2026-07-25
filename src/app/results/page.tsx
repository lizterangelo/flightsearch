"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { parseSearchQuery } from "@/lib/types";
import { buildFlightsPath } from "@/lib/urls";

/** Legacy query-param URLs redirect to the pretty /flights paths. */
function RedirectShim() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    try {
      const query = parseSearchQuery(new URLSearchParams(sp.toString()));
      router.replace(buildFlightsPath(query));
    } catch {
      router.replace("/");
    }
  }, [router, sp]);

  return null;
}

export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <RedirectShim />
    </Suspense>
  );
}
