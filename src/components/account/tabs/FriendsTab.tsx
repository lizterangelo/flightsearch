"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/auth/MeProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import { useToast } from "@/components/ui/Toast";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmptyState, PillButton, Row, Section } from "../primitives";

export interface FriendRow {
  id: string;
  given_name: string;
  family_name: string;
  born_on: string | null;
  gender: "m" | "f" | null;
  email: string | null;
  phone: string | null;
}

export const REFERRAL_REWARD_USD = 26.5;

/** Friends: referral hero + credit, saved co-travelers, share row. */
export default function FriendsTab() {
  const { me, profile } = useMe();
  const { format: money } = useCurrency();
  const toast = useToast();
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    given_name: "",
    family_name: "",
    born_on: "",
    gender: "f" as "m" | "f",
    email: "",
    phone: "",
  });

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from("friends")
        .select("*")
        .order("created_at");
      if (!cancelled) setFriends((data as FriendRow[] | null) ?? []);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const referralLink = () =>
    `${window.location.origin}/?ref=${profile?.account_uid ?? ""}`;

  const share = async () => {
    const url = referralLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Fly with me on Soar",
          text: "Book flights with me — we both get flight credit.",
          url,
        });
        return;
      } catch {
        // Fell through to copy.
      }
    }
    await navigator.clipboard.writeText(url);
    toast("Referral link copied");
  };

  const add = async () => {
    if (!me || !draft.given_name.trim() || !draft.family_name.trim()) return;
    const { data, error } = await supabaseBrowser()
      .from("friends")
      .insert({
        user_id: me.id,
        given_name: draft.given_name.trim(),
        family_name: draft.family_name.trim(),
        born_on: draft.born_on || null,
        gender: draft.gender,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
      })
      .select()
      .single();
    if (error) {
      toast("Couldn't save your friend");
      return;
    }
    setFriends((prev) => [...(prev ?? []), data as FriendRow]);
    setDraft({
      given_name: "",
      family_name: "",
      born_on: "",
      gender: "f",
      email: "",
      phone: "",
    });
    setAdding(false);
    toast("Friend saved — add them to any booking");
  };

  const remove = async (id: string) => {
    await supabaseBrowser().from("friends").delete().eq("id", id);
    setFriends((prev) => (prev ?? []).filter((f) => f.id !== id));
  };

  const input =
    "rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-accent/50 [color-scheme:dark]";

  return (
    <>
      {/* Referral hero */}
      <Section>
        <div className="px-4 py-4">
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-semibold text-accent-bright">
            Get {money(REFERRAL_REWARD_USD)} each
          </span>
          <div className="mt-2.5 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-bold text-white">
                Add Friends on Soar
              </div>
              <div className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">
                Book flights with friends. Get {money(REFERRAL_REWARD_USD)}{" "}
                each when a new signup books their first flight.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void share()}
              className="flex cursor-pointer items-center gap-2 btn-cta rounded-full px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-4">
                <path d="M17 3L9 11m8-8l-5.5 14-2.5-6-6-2.5L17 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              Share
            </button>
          </div>
        </div>
        <div className="border-t border-white/6 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-white">
              Available credit
            </span>
            <span className="text-[15px] font-bold text-emerald-300">
              {money(profile?.referral_credit_usd ?? 0)}
            </span>
          </div>
          <div className="mt-0.5 text-[13px] text-muted">
            Ready to use on an eligible trip
          </div>
        </div>
      </Section>

      {/* Friends list */}
      <Section>
        {friends !== null && friends.length === 0 && !adding && (
          <EmptyState
            icon={
              <svg viewBox="0 0 20 20" fill="none" className="size-6">
                <circle cx="7.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2.5 16c.4-2.4 2.5-3.8 5-3.8s4.6 1.4 5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="14" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M14.5 12.4c1.7.3 2.8 1.4 3 3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            }
            title="No friends yet"
            sub="Add someone to book flights together or split the cost."
            cta={<PillButton onClick={() => setAdding(true)}>+ Add manually</PillButton>}
          />
        )}

        {friends?.map((friend, i) => (
          <Row
            key={friend.id}
            title={`${friend.given_name} ${friend.family_name}`}
            sub={[friend.email, friend.born_on].filter(Boolean).join(" · ") || undefined}
            right={
              <button
                type="button"
                aria-label="Remove friend"
                onClick={() => void remove(friend.id)}
                className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            }
            last={i === friends.length - 1 && !adding}
          />
        ))}

        {friends !== null && friends.length > 0 && !adding && (
          <div className="px-4 py-3">
            <PillButton onClick={() => setAdding(true)}>
              + Add manually
            </PillButton>
          </div>
        )}

        {adding && (
          <div className="space-y-2.5 px-4 py-3.5">
            <div className="grid grid-cols-2 gap-2.5">
              <input
                value={draft.given_name}
                onChange={(e) => setDraft({ ...draft, given_name: e.target.value })}
                placeholder="First name"
                className={input}
              />
              <input
                value={draft.family_name}
                onChange={(e) => setDraft({ ...draft, family_name: e.target.value })}
                placeholder="Last name"
                className={input}
              />
              <input
                type="date"
                value={draft.born_on}
                onChange={(e) => setDraft({ ...draft, born_on: e.target.value })}
                className={input}
              />
              <select
                value={draft.gender}
                onChange={(e) =>
                  setDraft({ ...draft, gender: e.target.value as "m" | "f" })
                }
                className={`${input} cursor-pointer bg-panel`}
              >
                <option value="f">Female</option>
                <option value="m">Male</option>
              </select>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="Email (optional)"
                className={input}
              />
              <input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+63… (optional)"
                className={input}
              />
            </div>
            <div className="flex items-center gap-2.5">
              <PillButton
                onClick={() => void add()}
                disabled={!draft.given_name.trim() || !draft.family_name.trim()}
              >
                Save friend
              </PillButton>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="cursor-pointer px-2 text-sm text-muted hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Share row */}
      <div>
        <div className="px-1 pb-2.5 text-[13px] font-medium text-muted">
          Add a friend
        </div>
        <div className="flex items-center gap-5 px-1">
          {[
            {
              label: "Copy link",
              icon: (
                <svg viewBox="0 0 20 20" fill="none" className="size-5">
                  <path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.54 3.54 0 00-5-5l-1 1M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.54 3.54 0 005 5l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ),
              onClick: async () => {
                await navigator.clipboard.writeText(referralLink());
                toast("Link copied");
              },
            },
            {
              label: "iMessage",
              icon: (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/imessage-logo.png" alt="" className="size-7 rounded-lg" />
              ),
              onClick: () => {
                window.open(
                  `sms:?&body=${encodeURIComponent(`Fly with me on Soar: ${referralLink()}`)}`,
                );
              },
            },
            {
              label: "X",
              icon: (
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-4.5">
                  <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.9L18.9 2zm-1.1 18.1h1.7L7.1 3.8H5.3l12.5 16.3z" />
                </svg>
              ),
              onClick: () => {
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Fly with me on Soar ${referralLink()}`)}`,
                  "_blank",
                );
              },
            },
            {
              label: "Share",
              icon: (
                <svg viewBox="0 0 20 20" fill="none" className="size-5">
                  <path d="M10 12.5V3m0 0L6.5 6.5M10 3l3.5 3.5M4 12v3.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
              onClick: () => void share(),
            },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={() => void btn.onClick()}
              className="flex cursor-pointer flex-col items-center gap-1.5 text-slate-300 transition hover:text-white"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-white/6">
                {btn.icon}
              </span>
              <span className="text-xs">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
