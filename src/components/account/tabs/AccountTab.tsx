"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/auth/MeProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import MessageAgentButton from "@/components/MessageAgentButton";
import { useToast } from "@/components/ui/Toast";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FlightOffer } from "@/lib/types";
import { EditableRow, PillButton, Row, Section } from "../primitives";

interface Stats {
  totalSpentUSD: number;
  flights: number;
  countries: number;
}

/** Account: stats strip, contact details, iMessage, passkeys. */
export default function AccountTab() {
  const { me, profile, updateProfile } = useMe();
  const { format: money } = useCurrency();
  const toast = useToast();
  const [stats, setStats] = useState<Stats>({
    totalSpentUSD: 0,
    flights: 0,
    countries: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from("orders")
        .select("display_total_usd, status, offer_snapshot");
      if (cancelled || !data) return;
      const confirmed = (
        data as {
          display_total_usd: number;
          status: string;
          offer_snapshot: FlightOffer;
        }[]
      ).filter((o) => o.status === "confirmed");
      const countries = new Set<string>();
      for (const order of confirmed) {
        for (const slice of order.offer_snapshot?.slices ?? []) {
          for (const seg of slice.segments ?? []) {
            if (seg.destination) countries.add(seg.destinationName ?? seg.destination);
          }
        }
      }
      setStats({
        totalSpentUSD: confirmed.reduce(
          (sum, o) => sum + Number(o.display_total_usd || 0),
          0,
        ),
        flights: confirmed.length,
        countries: countries.size,
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (!me || !profile) return null;

  return (
    <>
      {/* Stats strip */}
      <div className="flex items-center gap-6 rounded-2xl bg-white/[0.03] px-6 py-5">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-14 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white">
            {(profile.nickname || me.name || "?").slice(0, 1)}
          </span>
        )}
        <div className="flex flex-1 items-center divide-x divide-white/8">
          <div className="pr-8">
            <div className="text-[13px] text-muted">Total spent</div>
            <div className="text-2xl font-bold text-white">
              {money(stats.totalSpentUSD)}
            </div>
          </div>
          <div className="px-8">
            <div className="text-[13px] text-muted">Flights</div>
            <div className="text-2xl font-bold text-white">{stats.flights}</div>
          </div>
          <div className="px-8">
            <div className="text-[13px] text-muted">Airports</div>
            <div className="text-2xl font-bold text-white">
              {stats.countries}
            </div>
          </div>
        </div>
      </div>

      <Section label="Contact details">
        <EditableRow
          title="Nickname"
          value={profile.nickname || me.name}
          onSave={(v) => updateProfile({ nickname: v || null })}
        />
        <EditableRow
          title="What best describes you?"
          value={profile.describes}
          onSave={(v) => updateProfile({ describes: v || null })}
        />
        <Row
          title={<span className="text-[13px] font-normal text-muted">Email</span>}
          sub={
            <span className="text-[15px] font-semibold text-white">
              {me.email}
            </span>
          }
          right={
            <span className="text-xs text-muted">via Google</span>
          }
        />
        <EditableRow
          title="Phone number"
          value={profile.phone}
          type="tel"
          last
          onSave={(v) => updateProfile({ phone: v || null })}
        />
      </Section>

      <Section>
        <Row
          title="iMessage"
          sub="Book flights and get trip alerts by texting Soar."
          right={
            <MessageAgentButton
              variant="pill"
              handle={process.env.NEXT_PUBLIC_IMESSAGE_HANDLE}
            />
          }
          last
        />
      </Section>

      <Section>
        <Row
          title="Passkeys"
          sub="Sign in with Face ID, Touch ID, or a security key."
          right={
            <PillButton
              onClick={() =>
                toast("This build signs in with Google — passkeys aren't set up")
              }
            >
              🔑 Create passkey
            </PillButton>
          }
          last
        />
      </Section>
    </>
  );
}
