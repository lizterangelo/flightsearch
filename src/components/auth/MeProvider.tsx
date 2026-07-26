"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/data";

export interface Me {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface MeState {
  me: Me | null;
  profile: ProfileRow | null;
  unseenWatchAlerts: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  /** Optimistic profile patch persisted to Supabase. */
  updateProfile: (patch: Partial<ProfileRow>) => Promise<boolean>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const MeContext = createContext<MeState>({
  me: null,
  profile: null,
  unseenWatchAlerts: 0,
  loaded: false,
  refresh: async () => {},
  updateProfile: async () => false,
  signInWithGoogle: async () => null,
  signOut: async () => {},
});

export function useMe(): MeState {
  return useContext(MeContext);
}

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const profileRef = useRef<ProfileRow | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const refresh = useCallback(async () => {
    const supabase = supabaseBrowser();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMe(null);
        setProfile(null);
        setUnseen(0);
        return;
      }
      setMe({
        id: user.id,
        email: user.email ?? null,
        name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        avatarUrl:
          (user.user_metadata?.avatar_url as string | undefined) ??
          (user.user_metadata?.picture as string | undefined) ??
          null,
      });
      const [{ data: profileRow }, { count }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("watches")
          .select("id", { count: "exact", head: true })
          .eq("seen", false),
      ]);
      setProfile((profileRow as ProfileRow | null) ?? null);
      setUnseen(count ?? 0);
    } catch {
      // Offline — keep last known state.
    } finally {
      setLoaded(true);
    }
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<ProfileRow>): Promise<boolean> => {
      const current = profileRef.current;
      if (!current) return false;
      setProfile({ ...current, ...patch });
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", current.id);
      if (error) {
        setProfile(current);
        return false;
      }
      return true;
    },
    [],
  );

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    // Preflight: the public settings endpoint says whether the Google
    // provider is enabled — otherwise the redirect would land on a raw
    // Supabase 400 page instead of an in-modal error.
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
      );
      const settings = (await res.json()) as {
        external?: Record<string, boolean>;
      };
      if (settings.external && settings.external.google === false) {
        return "provider is not enabled";
      }
    } catch {
      // Settings unreachable — let the OAuth call surface the real error.
    }
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabaseBrowser().auth.signOut();
    } finally {
      setMe(null);
      setProfile(null);
      setUnseen(0);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    const supabase = supabaseBrowser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void refresh();
      }
    });
    return () => {
      clearTimeout(t);
      subscription.unsubscribe();
    };
  }, [refresh]);

  return (
    <MeContext.Provider
      value={{
        me,
        profile,
        unseenWatchAlerts: unseen,
        loaded,
        refresh,
        updateProfile,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </MeContext.Provider>
  );
}
