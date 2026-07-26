import HeroTagline from "@/components/search/HeroTagline";
import SearchBar from "@/components/search/SearchBar";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
      <HeroTagline />

      <SearchBar />

      <footer className="fixed right-6 bottom-5 flex items-center gap-4 text-xs text-muted">
        <a href="/terms" className="transition hover:text-white">
          Terms
        </a>
        <a href="/privacy" className="transition hover:text-white">
          Privacy
        </a>
        <a
          href="https://x.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Soar on X"
          className="transition hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
            <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.9L18.9 2zm-1.1 18.1h1.7L7.1 3.8H5.3l12.5 16.3z" />
          </svg>
        </a>
      </footer>
    </main>
  );
}
