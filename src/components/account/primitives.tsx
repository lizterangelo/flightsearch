"use client";

import { useState, type ReactNode } from "react";

/**
 * Shared building blocks for the account modal, matching the observed
 * layout: section containers with a small grey label, inner cards with
 * divided rows, Edit pills, and the blue pill toggles.
 */

export function Section({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-2">
      {label && (
        <div className="px-4 pt-2.5 pb-2 text-[13px] font-medium text-muted">
          {label}
        </div>
      )}
      <div className="rounded-xl border border-white/8 bg-[#101218]">
        {children}
      </div>
    </div>
  );
}

export function Row({
  title,
  sub,
  right,
  danger = false,
  last = false,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 px-4 py-3.5 ${
        last ? "" : "border-b border-white/6"
      }`}
    >
      <div className="min-w-0">
        <div
          className={`text-[15px] font-semibold ${danger ? "text-rose-300" : "text-white"}`}
        >
          {title}
        </div>
        {sub && (
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {sub}
          </div>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export function PillButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Row whose value flips into an inline input on Edit. */
export function EditableRow({
  title,
  value,
  placeholder = "—",
  type = "text",
  last = false,
  onSave,
}: {
  title: string;
  value: string | null;
  placeholder?: string;
  type?: "text" | "date" | "tel" | "email";
  last?: boolean;
  onSave: (value: string) => Promise<boolean> | boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await onSave(draft.trim());
    setBusy(false);
    if (ok) setEditing(false);
  };

  return (
    <div
      className={`flex items-center justify-between gap-6 px-4 py-3 ${
        last ? "" : "border-b border-white/6"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-muted">{title}</div>
        {editing ? (
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="mt-0.5 w-full max-w-xs rounded-lg border border-accent/50 bg-white/5 px-2.5 py-1 text-[15px] font-semibold text-white outline-none [color-scheme:dark]"
          />
        ) : (
          <div
            className={`mt-0.5 truncate text-[15px] font-semibold ${value ? "text-white" : "text-muted"}`}
          >
            {value || placeholder}
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex shrink-0 items-center gap-2">
          <PillButton onClick={() => void save()} disabled={busy}>
            {busy ? "…" : "Save"}
          </PillButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-muted transition hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <PillButton
          onClick={() => {
            setDraft(value ?? "");
            setEditing(true);
          }}
        >
          Edit
        </PillButton>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  sub,
  cta,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  cta?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white/6 text-slate-300">
        {icon}
      </span>
      <div className="mt-4 text-[15px] font-bold text-white">{title}</div>
      <div className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted">
        {sub}
      </div>
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
