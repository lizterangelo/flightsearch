"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { APPROX_USD_RATES } from "@/lib/currency";
import { useMe } from "./auth/MeProvider";

/**
 * Display-currency context: every price in the app is computed in USD and
 * converted here using the static rate table (Settings → Currency). Duffel
 * is always paid in the offer's own currency — this is display only.
 */

interface CurrencyState {
  currency: string;
  /** USD → display currency, rounded, symbol-formatted ("₱14,220"). */
  format: (usd: number) => string;
}

const CurrencyContext = createContext<CurrencyState>({
  currency: "USD",
  format: (usd) => `$${Math.round(usd).toLocaleString("en-US")}`,
});

export function useCurrency(): CurrencyState {
  return useContext(CurrencyContext);
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { profile } = useMe();
  const currency = profile?.currency ?? "USD";

  const value = useMemo<CurrencyState>(() => {
    const usdRate = APPROX_USD_RATES[currency] ?? 1;
    const format = (usd: number) => {
      const amount = usd / usdRate;
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(amount);
      } catch {
        return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
      }
    };
    return { currency, format };
  }, [currency]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}
