"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared dark dropdown primitive: a trigger with a chevron and an anchored
 * dark panel. Used by the options row and the results filter bar.
 */
export default function Dropdown({
  trigger,
  children,
  align = "left",
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (v: boolean) => {
    setUncontrolledOpen(v);
    onOpenChange?.(v);
  };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="cursor-pointer select-none"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-2 min-w-44 rounded-2xl border border-card-border bg-popover/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {typeof children === "function"
            ? children(() => setOpen(false))
            : children}
        </div>
      )}
    </div>
  );
}

export function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M5 8l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuItem({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors ${
        selected
          ? "bg-accent/20 text-white"
          : "text-slate-200 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
