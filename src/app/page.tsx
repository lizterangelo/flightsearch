import NLSearch from "@/components/search/NLSearch";
import SearchBar from "@/components/search/SearchBar";
import { activeSourceLabels } from "@/lib/env";

export default function Home() {
  const sources = activeSourceLabels();
  const nlEnabled = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
      <h1 className="mb-14 text-center text-5xl font-semibold tracking-tight text-white sm:text-6xl md:text-7xl">
        Fly now, explain later.
      </h1>

      <SearchBar />
      {nlEnabled && <NLSearch />}

      <div className="mt-10 text-center text-xs text-muted">
        {sources.length > 0 ? (
          <>Sources: {sources.join(" · ")}</>
        ) : (
          <>No data sources configured — add keys to .env.local (see README)</>
        )}
      </div>
    </main>
  );
}
