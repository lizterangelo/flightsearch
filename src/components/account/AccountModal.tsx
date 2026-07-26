"use client";

import { useEffect, useState } from "react";
import AuthModal from "@/components/auth/AuthModal";
import { useMe } from "@/components/auth/MeProvider";
import { useToast } from "@/components/ui/Toast";
import AccountTab from "./tabs/AccountTab";
import BetaTab from "./tabs/BetaTab";
import BillingTab from "./tabs/BillingTab";
import DetailsTab from "./tabs/DetailsTab";
import FriendsTab from "./tabs/FriendsTab";
import LoyaltyTab from "./tabs/LoyaltyTab";
import NotificationsTab from "./tabs/NotificationsTab";
import ReceiptsTab from "./tabs/ReceiptsTab";
import SettingsTab from "./tabs/SettingsTab";

/**
 * The account modal, hash-routed exactly like the original:
 * #/account/{account|profile|loyalty|friends|notifications|billing|receipts|beta|settings}
 * opens over whatever page you're on; closing restores the hash-less URL.
 */

type TabId =
  | "account"
  | "profile"
  | "loyalty"
  | "friends"
  | "notifications"
  | "billing"
  | "receipts"
  | "beta"
  | "settings";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "account",
    label: "Account",
    icon: null, // avatar rendered specially
  },
  {
    id: "profile",
    label: "Details",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="7" cy="9" r="1.6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4.5 13.5c.5-1.2 1.5-1.8 2.5-1.8s2 .6 2.5 1.8M11.5 8h4M11.5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "loyalty",
    label: "Loyalty & Points",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <path d="M6 3h8v3.5a4 4 0 01-8 0V3z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 4H3.5v1a2.5 2.5 0 002.5 2.5M14 4h2.5v1A2.5 2.5 0 0114 7.5M10 10.5V14m-3 3h6m-5-3h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "friends",
    label: "Friends",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <circle cx="7.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 16c.4-2.4 2.5-3.8 5-3.8s4.6 1.4 5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="14" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M14.5 12.4c1.7.3 2.8 1.4 3 3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 3.6-1.2 4.8-1.9 5.5h12.8c-.7-.7-1.9-1.9-1.9-5.5A4.5 4.5 0 0010 3zM8.5 15.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "billing",
    label: "Billing",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <rect x="2.5" y="5" width="15" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 8.5h15M5.5 12.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "receipts",
    label: "Receipts",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <path d="M5.5 2.5h9v15l-2.25-1.5L10 17.5l-2.25-1.5L5.5 17.5v-15z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 7h4M8 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "beta",
    label: "Beta",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <path d="M8 3h4M8.75 3v5l-4.3 6.9A2 2 0 006.15 18h7.7a2 2 0 001.7-3.1L11.25 8V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 13.5h7" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 2.8l1 2 2.2.4 1.6-1.5 1.4 1.4-1.5 1.6.4 2.2 2 1-2 1-.4 2.2 1.5 1.6-1.4 1.4-1.6-1.5-2.2.4-1 2-1-2-2.2-.4-1.6 1.5-1.4-1.4 1.5-1.6-.4-2.2-2-1 2-1 .4-2.2L4.4 4.7l1.4-1.4 1.6 1.5 2.2-.4 1-2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function parseHash(): TabId | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#\/account(?:\/([a-z]+))?/);
  if (!match) return null;
  const tab = (match[1] ?? "account") as TabId;
  return TABS.some((t) => t.id === tab) ? tab : "account";
}

export default function AccountModal() {
  const { me, profile, loaded, signOut } = useMe();
  const toast = useToast();
  const [tab, setTab] = useState<TabId | null>(null);

  useEffect(() => {
    const sync = () => setTab(parseHash());
    const t = setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const close = () => {
    // Clear the hash without adding history entries or scrolling.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setTab(null);
  };

  if (!tab) return null;

  // Signed out → the sign-in modal takes the slot.
  if (loaded && !me) {
    return <AuthModal open onClose={close} />;
  }
  if (!me) return null;

  const go = (next: TabId) => {
    history.pushState(null, "", `#/account/${next}`);
    setTab(next);
  };

  const item = (t: (typeof TABS)[number]) => (
    <button
      key={t.id}
      type="button"
      onClick={() => go(t.id)}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium transition ${
        tab === t.id
          ? "bg-white/8 text-white"
          : "text-slate-300 hover:bg-white/4 hover:text-white"
      }`}
    >
      {t.id === "account" ? (
        me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-[22px] rounded-full object-cover"
          />
        ) : (
          <span className="flex size-[22px] items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white">
            {(profile?.nickname || me.name || "?").slice(0, 1)}
          </span>
        )
      ) : (
        <span className="text-slate-400">{t.icon}</span>
      )}
      {t.label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div
        className="fixed inset-0 animate-[soar-backdrop-in_.24s_ease_both] bg-black/70 backdrop-blur-sm"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        className="relative flex h-[92vh] w-full max-w-[1150px] animate-[soar-dialog-in_.26s_cubic-bezier(.22,1,.36,1)_both] flex-col overflow-hidden rounded-[28px] border border-white/8 bg-[#0b0d12] shadow-2xl shadow-black/70"
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <h1 className="text-[26px] font-bold text-white">Settings</h1>
          <button
            type="button"
            onClick={close}
            aria-label="Close settings"
            className="flex size-9 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <nav className="flex w-[230px] shrink-0 flex-col px-4 pt-2 pb-5 max-sm:w-[64px]">
            <div className="space-y-0.5 [&_button]:max-sm:justify-center [&_button_span+*]:max-sm:hidden">
              {TABS.map(item)}
            </div>
            <div className="mt-auto space-y-0.5 pt-6">
              <button
                type="button"
                onClick={() => {
                  window.open("mailto:support@example.com?subject=Soar%20clone%20help");
                }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium text-slate-300 transition hover:bg-white/4 hover:text-white"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-[18px] text-slate-400">
                  <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8.2 7.8a1.8 1.8 0 113 1.3c-.6.5-1.2.8-1.2 1.7M10 13.6v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Get help
              </button>
              <FeedbackButton />
              <button
                type="button"
                onClick={() => window.open("https://discord.com", "_blank")}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium text-slate-300 transition hover:bg-white/4 hover:text-white"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-[18px] text-slate-400">
                  <path d="M7 5.5C8 5.2 9 5 10 5s2 .2 3 .5c1.4.5 2.6 1.6 3 3 .5 1.8.6 3.6.3 5.3-.9.8-2.1 1.4-3.3 1.7l-.7-1.4c-.7.2-1.5.3-2.3.3s-1.6-.1-2.3-.3L7 15.5c-1.2-.3-2.4-.9-3.3-1.7-.3-1.7-.2-3.5.3-5.3.4-1.4 1.6-2.5 3-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="7.8" cy="10.5" r="0.9" fill="currentColor" />
                  <circle cx="12.2" cy="10.5" r="0.9" fill="currentColor" />
                </svg>
                Join Discord
              </button>
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => {
                    close();
                    toast("Signed out");
                  });
                }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium text-rose-400 transition hover:bg-rose-400/10"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
                  <path d="M8 3.5H5A1.5 1.5 0 003.5 5v10A1.5 1.5 0 005 16.5h3M13 6.5l3.5 3.5-3.5 3.5M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Log out
              </button>
            </div>
          </nav>

          {/* Content */}
          <div className="min-w-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-6">
            <div className="mx-auto max-w-[640px] space-y-4 pt-2">
              {tab === "account" && <AccountTab />}
              {tab === "profile" && <DetailsTab />}
              {tab === "loyalty" && <LoyaltyTab />}
              {tab === "friends" && <FriendsTab />}
              {tab === "notifications" && <NotificationsTab />}
              {tab === "billing" && <BillingTab />}
              {tab === "receipts" && <ReceiptsTab />}
              {tab === "beta" && <BetaTab />}
              {tab === "settings" && <SettingsTab onDeleted={close} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackButton() {
  const { me } = useMe();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!message.trim() || !me) return;
    setBusy(true);
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    const { error } = await supabaseBrowser()
      .from("feedback")
      .insert({ user_id: me.id, message: message.trim() });
    setBusy(false);
    if (error) {
      toast("Couldn't send feedback");
      return;
    }
    setMessage("");
    setOpen(false);
    toast("Thanks — feedback logged");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium text-slate-300 transition hover:bg-white/4 hover:text-white"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px] text-slate-400">
          <path d="M3.5 5.5A1.5 1.5 0 015 4h10a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0115 14H8l-3.2 2.6a.4.4 0 01-.65-.31L4.5 14h.5A1.5 1.5 0 013.5 12.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M7 8h6M7 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        Give feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm animate-[soar-dialog-in_.24s_ease_both] rounded-3xl border border-white/10 bg-[#101218] p-5">
            <div className="text-lg font-bold text-white">Give feedback</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="What's working? What's broken?"
              className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-full px-4 py-2 text-sm text-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !message.trim()}
                onClick={() => void submit()}
                className="cursor-pointer rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
