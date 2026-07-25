"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Anchored click-popover: trigger inline, dark panel below (or above).
 * Closes on outside click / Escape.
 */
export default function Popover({
  trigger,
  children,
  align = "left",
  triggerClassName,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName ?? "cursor-pointer"}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-full z-[70] mt-2 min-w-56 rounded-2xl border border-card-border bg-[#0b1428] p-4 shadow-2xl shadow-black/60 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </span>
  );
}
