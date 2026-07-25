export default function NightSky() {
  return (
    <>
      <div className="sky-gradient" aria-hidden />
      <div className="stars" aria-hidden />
      <div className="stars-far" aria-hidden />
      <div className="clouds" aria-hidden />
      {/* Crescent moon, top-right like the landing mock. */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-16 right-24 z-0 hidden md:block"
      >
        <svg viewBox="0 0 96 96" fill="none" className="size-24 opacity-90">
          <defs>
            <radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="rgba(220,230,255,0.16)" />
              <stop offset="100%" stopColor="rgba(220,230,255,0)" />
            </radialGradient>
          </defs>
          <circle cx="48" cy="48" r="48" fill="url(#moon-glow)" />
          <circle cx="48" cy="48" r="26" fill="#e8ecf8" />
          <circle cx="41" cy="44" r="24.5" fill="#050b18" />
        </svg>
      </div>
    </>
  );
}
