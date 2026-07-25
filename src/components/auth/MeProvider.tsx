"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Me {
  id: number;
  identifier: string;
}

interface MeState {
  me: Me | null;
  unseenWatchAlerts: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const MeContext = createContext<MeState>({
  me: null,
  unseenWatchAlerts: 0,
  loaded: false,
  refresh: async () => {},
  signOut: async () => {},
});

export function useMe(): MeState {
  return useContext(MeContext);
}

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      const body = (await res.json()) as {
        user: Me | null;
        unseenWatchAlerts: number;
      };
      setMe(body.user);
      setUnseen(body.unseenWatchAlerts ?? 0);
    } catch {
      // Offline — keep last known state.
    } finally {
      setLoaded(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setMe(null);
      setUnseen(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <MeContext.Provider
      value={{ me, unseenWatchAlerts: unseen, loaded, refresh, signOut }}
    >
      {children}
    </MeContext.Provider>
  );
}
