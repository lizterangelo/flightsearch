"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/auth/MeProvider";
import { useToast } from "@/components/ui/Toast";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmptyState, PillButton, Row, Section } from "../primitives";

interface Card {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  cardholder: string | null;
  is_default: boolean;
}

function detectBrand(number: string): string {
  if (/^4/.test(number)) return "Visa";
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return "Mastercard";
  if (/^3[47]/.test(number)) return "Amex";
  if (/^6(?:011|5)/.test(number)) return "Discover";
  if (/^35/.test(number)) return "JCB";
  return "Card";
}

function luhnOk(number: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let n = Number(number[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return number.length >= 13 && sum % 10 === 0;
}

/**
 * Billing: a display-only card vault (brand + last4 + expiry — the full
 * number never leaves the form). Payments in this build always use the
 * Duffel test balance.
 */
export default function BillingTab() {
  const { me } = useMe();
  const toast = useToast();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [holder, setHolder] = useState("");

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from("payment_cards")
        .select("*")
        .order("created_at");
      if (!cancelled) setCards((data as Card[] | null) ?? []);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const add = async () => {
    if (!me) return;
    const digits = number.replace(/[\s-]/g, "");
    const expMatch = expiry.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
    if (!luhnOk(digits)) {
      toast("That card number doesn't check out");
      return;
    }
    if (!expMatch) {
      toast("Expiry looks off — use MM/YY");
      return;
    }
    const expMonth = Number(expMatch[1]);
    const expYear = Number(expMatch[2].length === 2 ? `20${expMatch[2]}` : expMatch[2]);
    if (expMonth < 1 || expMonth > 12) {
      toast("Expiry month must be 1–12");
      return;
    }
    const { data, error } = await supabaseBrowser()
      .from("payment_cards")
      .insert({
        user_id: me.id,
        brand: detectBrand(digits),
        last4: digits.slice(-4),
        exp_month: expMonth,
        exp_year: expYear,
        cardholder: holder.trim() || null,
        is_default: (cards?.length ?? 0) === 0,
      })
      .select()
      .single();
    if (error) {
      toast("Couldn't save the card");
      return;
    }
    setCards((prev) => [...(prev ?? []), data as Card]);
    setNumber("");
    setExpiry("");
    setHolder("");
    setAdding(false);
    toast("Card saved — only the brand and last four digits are stored");
  };

  const remove = async (id: string) => {
    await supabaseBrowser().from("payment_cards").delete().eq("id", id);
    setCards((prev) => (prev ?? []).filter((c) => c.id !== id));
  };

  const makeDefault = async (id: string) => {
    const db = supabaseBrowser();
    await db.from("payment_cards").update({ is_default: false }).neq("id", id);
    await db.from("payment_cards").update({ is_default: true }).eq("id", id);
    setCards((prev) =>
      (prev ?? []).map((c) => ({ ...c, is_default: c.id === id })),
    );
  };

  const input =
    "rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-accent/50";

  return (
    <>
      <Section>
        {cards !== null && cards.length === 0 && !adding && (
          <EmptyState
            icon={
              <svg viewBox="0 0 20 20" fill="none" className="size-6">
                <rect x="2.5" y="5" width="15" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2.5 8.5h15M5.5 12.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            }
            title="No cards on file"
            sub="Add one to enable one-tap booking."
            cta={<PillButton onClick={() => setAdding(true)}>+ Add credit card</PillButton>}
          />
        )}

        {cards?.map((card, i) => (
          <Row
            key={card.id}
            title={
              <span className="flex items-center gap-2.5">
                {card.brand} •••• {card.last4}
                {card.is_default && (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-bright">
                    Default
                  </span>
                )}
              </span>
            }
            sub={`Expires ${String(card.exp_month).padStart(2, "0")}/${card.exp_year}${card.cardholder ? ` · ${card.cardholder}` : ""}`}
            right={
              <span className="flex items-center gap-2">
                {!card.is_default && (
                  <PillButton onClick={() => void makeDefault(card.id)}>
                    Make default
                  </PillButton>
                )}
                <button
                  type="button"
                  aria-label="Remove card"
                  onClick={() => void remove(card.id)}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </span>
            }
            last={i === cards.length - 1 && !adding}
          />
        ))}

        {cards !== null && cards.length > 0 && !adding && (
          <div className="px-4 py-3">
            <PillButton onClick={() => setAdding(true)}>
              + Add credit card
            </PillButton>
          </div>
        )}

        {adding && (
          <div className="space-y-2.5 px-4 py-3.5">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
              placeholder="Card number (test cards welcome)"
              className={`${input} w-full font-mono`}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                placeholder="MM/YY"
                className={input}
              />
              <input
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder="Name on card (optional)"
                className={input}
              />
            </div>
            <div className="flex items-center gap-2.5">
              <PillButton onClick={() => void add()} disabled={!number.trim()}>
                Save card
              </PillButton>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="cursor-pointer px-2 text-sm text-muted hover:text-white"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Display vault only — the full number is discarded after brand
              detection, and every payment in this build settles from the
              Duffel test balance.
            </p>
          </div>
        )}
      </Section>
    </>
  );
}
