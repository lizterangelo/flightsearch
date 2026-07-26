"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/auth/MeProvider";
import { useToast } from "@/components/ui/Toast";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmptyState, PillButton, Row, Section } from "../primitives";

interface Programme {
  id: string;
  airline_iata: string;
  airline_name: string;
  account_number: string;
}

const AIRLINES: [string, string][] = [
  ["AA", "American Airlines"],
  ["AC", "Air Canada"],
  ["AF", "Air France"],
  ["AS", "Alaska Airlines"],
  ["BA", "British Airways"],
  ["CX", "Cathay Pacific"],
  ["DL", "Delta Air Lines"],
  ["EK", "Emirates"],
  ["IB", "Iberia"],
  ["JL", "Japan Airlines"],
  ["KE", "Korean Air"],
  ["LH", "Lufthansa"],
  ["NH", "ANA"],
  ["PR", "Philippine Airlines"],
  ["QF", "Qantas"],
  ["QR", "Qatar Airways"],
  ["SQ", "Singapore Airlines"],
  ["TK", "Turkish Airlines"],
  ["UA", "United"],
  ["ZZ", "Duffel Airways"],
];

/** Loyalty & Points: frequent-flyer accounts, points teaser, referral. */
export default function LoyaltyTab() {
  const { me, profile, updateProfile } = useMe();
  const toast = useToast();
  const [programmes, setProgrammes] = useState<Programme[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [airline, setAirline] = useState("PR");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from("loyalty_programmes")
        .select("*")
        .order("created_at");
      if (!cancelled) setProgrammes((data as Programme[] | null) ?? []);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const add = async () => {
    if (!me || !number.trim()) return;
    const name = AIRLINES.find(([iata]) => iata === airline)?.[1] ?? airline;
    const { data, error } = await supabaseBrowser()
      .from("loyalty_programmes")
      .insert({
        user_id: me.id,
        airline_iata: airline,
        airline_name: name,
        account_number: number.trim(),
      })
      .select()
      .single();
    if (error) {
      toast("Couldn't save the programme");
      return;
    }
    setProgrammes((prev) => [...(prev ?? []), data as Programme]);
    setNumber("");
    setAdding(false);
    toast("Programme added — it auto-fills at checkout");
  };

  const remove = async (id: string) => {
    await supabaseBrowser().from("loyalty_programmes").delete().eq("id", id);
    setProgrammes((prev) => (prev ?? []).filter((p) => p.id !== id));
  };

  const redeem = async () => {
    const value = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(value)) {
      toast("Codes are 8 characters — check and try again");
      return;
    }
    if (value === profile?.account_uid) {
      toast("That's your own code — send it to a friend instead");
      return;
    }
    await updateProfile({
      referral_credit_usd: (profile?.referral_credit_usd ?? 0) + 5,
    });
    setCode("");
    toast("Referral applied — credit added 🎉");
  };

  return (
    <>
      <Section>
        {programmes !== null && programmes.length === 0 && !adding && (
          <EmptyState
            icon={
              <svg viewBox="0 0 20 20" fill="none" className="size-6">
                <path d="M6 3h8v3.5a4 4 0 01-8 0V3z" stroke="currentColor" strokeWidth="1.4" />
                <path d="M6 4H3.5v1a2.5 2.5 0 002.5 2.5M14 4h2.5v1A2.5 2.5 0 0114 7.5M10 10.5V14m-3 3h6m-5-3h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            }
            title="No loyalty programmes yet"
            sub="Add your frequent-flyer accounts so they auto-fill on every booking."
            cta={<PillButton onClick={() => setAdding(true)}>+ Add programme</PillButton>}
          />
        )}

        {programmes?.map((programme, i) => (
          <Row
            key={programme.id}
            title={programme.airline_name}
            sub={`${programme.airline_iata} · ${programme.account_number}`}
            right={
              <button
                type="button"
                aria-label="Remove programme"
                onClick={() => void remove(programme.id)}
                className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            }
            last={i === programmes.length - 1 && !adding}
          />
        ))}

        {programmes !== null && programmes.length > 0 && !adding && (
          <div className="px-4 py-3">
            <PillButton onClick={() => setAdding(true)}>
              + Add programme
            </PillButton>
          </div>
        )}

        {adding && (
          <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5">
            <select
              value={airline}
              onChange={(e) => setAirline(e.target.value)}
              className="cursor-pointer rounded-xl border border-white/12 bg-[#0b0d12] px-3 py-2 text-sm font-medium text-white outline-none"
            >
              {AIRLINES.map(([iata, name]) => (
                <option key={iata} value={iata}>
                  {name}
                </option>
              ))}
            </select>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Membership number"
              className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
            <PillButton onClick={() => void add()} disabled={!number.trim()}>
              Save
            </PillButton>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="cursor-pointer px-2 text-sm text-muted hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </Section>

      <Section>
        <Row
          title={
            <span className="flex items-center gap-2.5">
              Points
              <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-semibold text-accent-bright">
                Coming soon
              </span>
              {(profile?.points ?? 0) > 0 && (
                <span className="text-sm font-normal text-muted">
                  {profile!.points.toLocaleString("en-US")} earned
                </span>
              )}
            </span>
          }
          sub="Redeem your Amex, Revolut & airline rewards for money off flights."
          right={
            <PillButton onClick={() => toast("Interest registered ✓")}>
              🔔 Register interest
            </PillButton>
          }
          last
        />
      </Section>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-white">
              Referral code
            </div>
            <div className="mt-0.5 text-[13px] text-muted">
              Enter a referral code to claim rewards on your next flight.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="8-char code"
              maxLength={8}
              className="w-32 rounded-xl border border-white/12 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none placeholder:font-sans placeholder:text-muted/60 focus:border-accent/50"
            />
            <PillButton onClick={() => void redeem()} disabled={!code.trim()}>
              🎟 Redeem
            </PillButton>
          </div>
        </div>
      </Section>
    </>
  );
}
