"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { useMe } from "./auth/MeProvider";

/**
 * The homepage clouds (their harvested AVIF art) drifting along the bottom
 * of the hero. Two motions layered:
 *   - CSS: a slow bob (soar-cloud-drift) + horizontal sway per cloud
 *   - JS:  cursor parallax — each cloud eases toward an offset scaled by
 *          its depth, so the bank shifts as you move the mouse
 * Purely decorative: pointer-events none, hidden for power saver, and the
 * parallax/animations stop under prefers-reduced-motion.
 */

const CLOUDS: {
  src: string;
  width: number;
  height: number;
  depth: number;
  className: string;
  style: React.CSSProperties;
}[] = [
  {
    src: "/ds-assets/clouds/clouds-2.avif",
    width: 2065,
    height: 1310,
    depth: 0.5,
    className: "opacity-90",
    style: { left: "14vw", bottom: "-16vh", width: "max(58vw, 480px)" },
  },
  {
    src: "/ds-assets/clouds/clouds-1.avif",
    width: 1124,
    height: 702,
    depth: 0.95,
    className: "opacity-95",
    style: { left: "-8vw", bottom: "-10vh", width: "max(44vw, 360px)" },
  },
  {
    src: "/ds-assets/clouds/clouds-3.avif",
    width: 1638,
    height: 1082,
    depth: 1.25,
    className: "opacity-95",
    style: { right: "-6vw", bottom: "-12vh", width: "max(46vw, 400px)" },
  },
  {
    src: "/ds-assets/clouds/clouds-4.avif",
    width: 2560,
    height: 1400,
    depth: 1.8,
    className: "opacity-80",
    style: { right: "10vw", bottom: "12vh", width: "max(28vw, 200px)" },
  },
];

export default function CloudLayer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { profile } = useMe();
  const powerSaver = profile?.power_saver ?? false;

  useEffect(() => {
    if (powerSaver) return;
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layers = Array.from(
      root.querySelectorAll<HTMLElement>("[data-depth]"),
    ).map((el) => ({ el, depth: Number(el.dataset.depth) }));

    let raf = 0;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      for (const { el, depth } of layers) {
        el.style.transform = `translate3d(${cur.x * depth * -36}px, ${
          cur.y * depth * -18
        }px, 0)`;
      }
      const settled =
        Math.abs(target.x - cur.x) < 0.0006 &&
        Math.abs(target.y - cur.y) < 0.0006;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [powerSaver]);

  if (powerSaver) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
    >
      {CLOUDS.map((cloud, i) => (
        <div
          key={cloud.src}
          data-depth={cloud.depth}
          className="absolute will-change-transform"
          style={cloud.style}
        >
          <div className="cloud-sway" style={{ animationDelay: `${i * -7}s` }}>
            <Image
              src={cloud.src}
              alt=""
              width={cloud.width}
              height={cloud.height}
              className={`cloud-bob h-auto w-full select-none ${cloud.className}`}
              style={{ animationDelay: `${i * -3.5}s` }}
              loading="eager"
              unoptimized
            />
          </div>
        </div>
      ))}
    </div>
  );
}
