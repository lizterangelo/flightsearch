import SearchBar from "@/components/search/SearchBar";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
      <h1 className="mb-14 text-center text-5xl font-semibold tracking-tight text-white sm:text-6xl md:text-7xl">
        Your passport&apos;s getting restless.
      </h1>

      <SearchBar />
    </main>
  );
}
