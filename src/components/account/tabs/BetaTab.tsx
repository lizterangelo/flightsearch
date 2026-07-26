"use client";

import { useMe } from "@/components/auth/MeProvider";
import { useToast } from "@/components/ui/Toast";
import { Toggle } from "../primitives";

/**
 * Beta: illustrated experiment cards (illustrations recreated as small CSS
 * mocks). Toggles persist; the features themselves are simulated in this
 * build.
 */

function BetaCard({
  illustration,
  title,
  sub,
  checked,
  onChange,
}: {
  illustration: React.ReactNode;
  title: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-2">
      <div className="rounded-xl border border-dashed border-white/12 bg-[#0d0f14] px-6 py-8">
        <div className="flex items-center justify-center">{illustration}</div>
      </div>
      <div className="flex items-center justify-between gap-6 px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
            {title}
            <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
              Beta
            </span>
          </div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {sub}
          </div>
        </div>
        <Toggle label={title} checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

const mono = "font-mono text-[10px] tracking-tight";

export default function BetaTab() {
  const { profile, updateProfile } = useMe();
  const toast = useToast();
  if (!profile) return null;

  const flip = (
    key: "beta_auto_checkin" | "beta_price_drop" | "beta_agent_booking",
    v: boolean,
  ) => {
    void updateProfile({ [key]: v });
    if (v) toast("Enabled — simulated in this build");
  };

  return (
    <>
      <BetaCard
        title="Auto Check-in"
        sub="AI Agents will check you into your flight and iMessage your boarding pass."
        checked={profile.beta_auto_checkin}
        onChange={(v) => flip("beta_auto_checkin", v)}
        illustration={
          <div className="relative">
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 font-mono text-[10px] font-bold whitespace-nowrap text-white">
              You&apos;re checked in ✓
            </span>
            <div className="mt-2 w-44 rounded-xl border border-white/15 bg-white/[0.04] p-3">
              <div className={`flex items-center justify-between text-white ${mono}`}>
                <b className="text-[13px]">SEA</b>
                <span className="px-1 text-muted">···✈···</span>
                <b className="text-[13px]">JFK</b>
              </div>
              <div className={`mt-2 flex items-end justify-between ${mono}`}>
                <div>
                  <div className="text-muted">Boarding pass</div>
                  <div className="text-[13px] font-bold text-white">14A</div>
                </div>
                {/* QR-ish block */}
                <div className="grid grid-cols-4 gap-0.5">
                  {[1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1].map(
                    (on, i) => (
                      <span
                        key={i}
                        className={`size-1.5 ${on ? "bg-white" : "bg-white/15"}`}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
            <span className="mt-2 flex w-fit items-center gap-1.5 rounded-md border border-white/20 bg-black px-2 py-1 font-mono text-[9px] text-white">
              <span className="rounded-sm bg-gradient-to-br from-amber-200 to-amber-400 px-1 text-[8px] text-black">▮</span>
              Add to Apple Wallet
            </span>
          </div>
        }
      />

      <BetaCard
        title="Price Drop"
        sub="Automatically secures airline refunds/credits every time fares drop."
        checked={profile.beta_price_drop}
        onChange={(v) => flip("beta_price_drop", v)}
        illustration={
          <div className="flex items-center gap-4">
            <div className="w-40 rounded-xl border border-white/15 bg-white/[0.04] p-3">
              <div className={`flex items-center justify-between text-muted ${mono}`}>
                <span>LAX → CDG</span>
                <span>Nov 14</span>
              </div>
              <div className={`mt-1 ${mono}`}>
                <span className="text-muted line-through">$214</span>{" "}
                <b className="text-[15px] text-white">$186</b>
              </div>
              {/* dashed sparkline */}
              <svg viewBox="0 0 120 28" className="mt-1.5 w-full">
                <path
                  d="M2 8c14 2 20 8 32 8s18-6 30-4 22 10 36 12"
                  fill="none"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                <circle cx="112" cy="24" r="2.5" fill="#34d399" />
              </svg>
            </div>
            <div>
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 font-mono text-[12px] font-bold text-emerald-300">
                +$28
              </span>
              <div className={`mt-1.5 text-muted ${mono}`}>
                Refunded automatically
              </div>
            </div>
          </div>
        }
      />

      <BetaCard
        title="Agent Booking"
        sub="Opens support for additional airlines at the cheapest price via experimental agent booking."
        checked={profile.beta_agent_booking}
        onChange={(v) => flip("beta_agent_booking", v)}
        illustration={
          <div className="w-56 overflow-hidden rounded-xl border border-white/15 bg-white/[0.04]">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-2.5 py-1.5">
              <span className="size-1.5 rounded-full bg-white/25" />
              <span className="size-1.5 rounded-full bg-white/25" />
              <span className="size-1.5 rounded-full bg-white/25" />
              <span className={`mx-auto rounded-md bg-white/10 px-3 py-0.5 text-muted ${mono}`}>
                jetblue.com
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className={mono}>
                <div className="text-[12px] font-bold text-white">
                  BOS → MCO
                </div>
                <div className="text-muted">Nonstop · 3h 12m · $129</div>
              </div>
              <div className="relative">
                <span className="rounded-full bg-accent px-3 py-1 font-mono text-[10px] font-bold text-white">
                  Book
                </span>
                {/* cursor */}
                <svg
                  viewBox="0 0 20 20"
                  className="absolute -right-1.5 -bottom-2 size-4 text-white drop-shadow"
                  fill="currentColor"
                >
                  <path d="M4 2l12 7-5 1.5L14 16l-2.5 1.5-3-5.5L4 15V2z" />
                </svg>
              </div>
            </div>
          </div>
        }
      />
    </>
  );
}
