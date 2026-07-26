"use client";

import { useEffect } from "react";
import { useMe } from "./auth/MeProvider";

/** Settings → Theme: stamps html[data-theme] (system follows the OS). */
export default function ThemeApplier() {
  const { profile } = useMe();
  const theme = profile?.theme ?? "dark";

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : theme;
      root.setAttribute("data-theme", resolved);
    };
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  return null;
}
