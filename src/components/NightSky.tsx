"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMe } from "./auth/MeProvider";

/**
 * The Soar sky, layer for layer (classes in soar-theme.css):
 *   1  sky-ramp-morph  — tinted dome/wall gradients (morphable via @property)
 *   2  star-dot layer  — static CSS radial-gradient dots
 *   2  sky-moon        — crescent drawn purely with offset box-shadows
 *   2  sky-rays        — repeating-conic light shafts, screen-blended
 *   3  sky-grain       — feTurbulence film grain, soft-light
 *   4+5 two canvases   — twinkling star layers
 * All wrapped in sky-unit-mask (fades toward the horizon).
 */

/** Deterministic PRNG so the sky doesn't reshuffle every render. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starDotsBackground(): string {
  const rand = mulberry32(20260726);
  const dots: string[] = [];
  for (let i = 0; i < 90; i++) {
    const x = Math.round(rand() * 100);
    const y = Math.round(rand() * 100);
    const alpha = (0.18 + rand() * 0.34).toFixed(2);
    const r1 = (0.5 + rand() * 0.4).toFixed(1);
    const r2 = (Number(r1) * 2).toFixed(1);
    dots.push(
      `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,${alpha}) 0px, rgba(255,255,255,${alpha}) ${r1}px, rgba(0,0,0,0) ${r2}px)`,
    );
  }
  return dots.join(",");
}

function StarCanvas({
  seed,
  count,
  maxRadius,
  speed,
}: {
  seed: number;
  count: number;
  maxRadius: number;
  speed: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let stars: { x: number; y: number; r: number; phase: number; rate: number; base: number }[] =
      [];
    let raf = 0;
    let width = 0;
    let height = 0;

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r2 = mulberry32(seed);
      stars = Array.from({ length: count }, () => ({
        x: r2() * width,
        y: r2() * height,
        r: 0.4 + r2() * maxRadius,
        phase: r2() * Math.PI * 2,
        rate: 0.4 + r2() * speed,
        base: 0.25 + r2() * 0.6,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        const twinkle = reduced
          ? 1
          : 0.55 + 0.45 * Math.sin(s.phase + (t / 1000) * s.rate);
        ctx.globalAlpha = s.base * twinkle;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    layout();
    raf = requestAnimationFrame(draw);
    const onResize = () => {
      layout();
      if (reduced) draw(0);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [seed, count, maxRadius, speed]);

  return <canvas ref={ref} className="sky-star-canvas" style={{ zIndex: 4 }} />;
}

export default function NightSky() {
  const dots = useMemo(() => starDotsBackground(), []);
  const { profile } = useMe();
  // Settings → Power Saver: keep the gradient dome, drop the GPU-hungry
  // layers (canvases, rays, grain, dot field).
  const powerSaver = profile?.power_saver ?? false;

  return (
    <div className="sky-unit" aria-hidden>
      <div className="sky-unit-mask">
        <div className="sky-ramp-morph" />
        {!powerSaver && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                opacity: 0.86,
                backgroundImage: dots,
              }}
            />
            <div
              className="sky-moon"
              style={{ width: 34, height: 34, top: "10%", left: "76.5%" }}
            />
            <div className="sky-rays" />
            <div className="sky-grain" />
            <StarCanvas seed={11} count={110} maxRadius={0.7} speed={1.1} />
            <StarCanvas seed={47} count={60} maxRadius={1.1} speed={1.9} />
          </>
        )}
      </div>
    </div>
  );
}
