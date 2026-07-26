"use client";

import { useEffect, useRef } from "react";
import { LAND_BITS_B64, LAND_H, LAND_W } from "./world-land";

/**
 * The sign-in modal's animated dotted world map: real continent shapes
 * (rasterized public-domain GeoJSON in world-land.ts) drawn as periwinkle
 * dots that twinkle, with a soft highlight band sweeping across — the
 * "moving" map on their modal. Static single frame under reduced motion.
 */

function decodeLand(): Uint8Array {
  const bin = atob(LAND_BITS_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Deterministic PRNG — dot phases stay put across renders. */
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

export default function WorldMap() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const bits = decodeLand();
    const rand = mulberry32(20260726);
    const dots: {
      gx: number;
      gy: number;
      phase: number;
      rate: number;
      base: number;
      bright: boolean;
    }[] = [];
    for (let gy = 0; gy < LAND_H; gy++) {
      for (let gx = 0; gx < LAND_W; gx++) {
        const idx = gy * LAND_W + gx;
        if (!(bits[idx >> 3] & (1 << (idx & 7)))) continue;
        dots.push({
          gx,
          gy,
          phase: rand() * Math.PI * 2,
          rate: 0.5 + rand() * 1.4,
          base: 0.4 + rand() * 0.5,
          // A sparse handful of brighter "city" dots.
          bright: rand() < 0.045,
        });
      }
    }

    let raf = 0;
    let width = 0;
    let height = 0;
    let cell = 0;
    let offX = 0;
    let offY = 0;

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fit the grid to the canvas, slightly overscanned so the map bleeds
      // to the edges like theirs.
      cell = Math.max(width / LAND_W, height / LAND_H) * 1.02;
      offX = (width - cell * LAND_W) / 2;
      offY = (height - cell * LAND_H) / 2 - height * 0.04;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const time = t / 1000;
      // Highlight band sweeping west→east, wrapping.
      const sweep = ((time * 0.09) % 1.4) - 0.2;
      for (const d of dots) {
        const x = offX + (d.gx + 0.5) * cell;
        const y = offY + (d.gy + 0.5) * cell;
        const twinkle = reduced
          ? 1
          : 0.72 + 0.28 * Math.sin(d.phase + time * d.rate);
        const band = reduced
          ? 0
          : Math.max(0, 1 - Math.abs(x / width - sweep) * 6);
        const alpha = Math.min(1, d.base * twinkle + band * 0.5);
        if (d.bright) {
          ctx.fillStyle = `rgba(199, 210, 251, ${Math.min(1, alpha + 0.25)})`;
        } else {
          ctx.fillStyle = `rgba(127, 164, 255, ${alpha})`;
        }
        ctx.beginPath();
        ctx.arc(x, y, d.bright ? cell * 0.24 : cell * 0.19, 0, Math.PI * 2);
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
  }, []);

  return (
    <div
      aria-hidden
      className="relative h-44 w-full overflow-hidden rounded-t-3xl"
      style={{
        maskImage:
          "radial-gradient(ellipse 92% 100% at 50% 38%, black 45%, transparent 96%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 92% 100% at 50% 38%, black 45%, transparent 96%)",
      }}
    >
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
