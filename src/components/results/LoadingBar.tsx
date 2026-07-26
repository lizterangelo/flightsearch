/**
 * Top-of-viewport progress bar (their loading-bar markup): a 3px rainbow
 * gradient with a blurred white streak, shown while results stream in.
 */
export default function LoadingBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px] overflow-hidden transition-opacity duration-[250ms] ease-linear ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="absolute inset-0 animate-[loading-bar-slide_1.6s_linear_infinite]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--color-loading-bar-1) 0%, var(--color-loading-bar-2) 14%, var(--color-loading-bar-streak) 18%, var(--color-loading-bar-3) 21%, var(--color-loading-bar-4) 36%, var(--color-loading-bar-streak-soft) 42%, var(--color-loading-bar-5) 46%, var(--color-loading-bar-2) 62%, var(--color-loading-bar-streak) 68%, var(--color-loading-bar-1) 72%, var(--color-loading-bar-4) 100%)",
          backgroundRepeat: "repeat",
          backgroundSize: "200% 100%",
          filter: "drop-shadow(0 0 8px var(--color-loading-bar-glow))",
        }}
      />
    </div>
  );
}
