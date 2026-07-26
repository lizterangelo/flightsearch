"use client";

import { useEffect, useState } from "react";

/**
 * Rotating hero greeting, swapped with the extracted blur-out/blur-in
 * keyframes. The phrases observed on the live homepage rotate here too.
 */
const TAGLINES = [
  "Your passport's getting restless.",
  "Adventure doesn't RSVP.",
];

const SWAP_MS = 6000;
const OUT_MS = 420;

export default function HeroTagline() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cycle = setInterval(() => {
      setLeaving(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % TAGLINES.length);
        setLeaving(false);
      }, OUT_MS);
    }, SWAP_MS);
    return () => clearInterval(cycle);
  }, []);

  return (
    <h1
      key={`${index}-${leaving}`}
      className={`mb-10 text-center font-display text-4xl font-semibold tracking-tight text-white sm:mb-14 sm:text-6xl md:text-7xl ${
        leaving
          ? "animate-[heroGreetingBlurOut_.42s_cubic-bezier(.55,0,.55,.2)_both]"
          : "animate-[heroGreetingBlurIn_.6s_cubic-bezier(.22,1,.36,1)_both]"
      }`}
    >
      {TAGLINES[index]}
    </h1>
  );
}
