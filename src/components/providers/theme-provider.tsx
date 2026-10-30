"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { THEME_COOKIE } from "@/lib/auth/constants";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  mounted: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveThemeValue(t: Theme): ResolvedTheme {
  return t === "system" ? "dark" : t;
}

const emptySubscribe = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const mounted = useMounted();
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemeValue(defaultTheme)
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const stored = localStorage.getItem("od-theme") as Theme | null;
      const attr = document.documentElement.getAttribute("data-theme") as Theme | null;
      const clientTheme = stored || attr || defaultTheme;
      if (clientTheme && clientTheme !== defaultTheme) {
        const res = resolveThemeValue(clientTheme);
        setThemeState(clientTheme);
        setResolvedTheme(res);
        document.documentElement.setAttribute("data-theme", res);
        document.documentElement.classList.toggle("dark", res === "dark");
        document.documentElement.classList.toggle("light", res === "light");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [defaultTheme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        const sys = e.matches ? "dark" : "light";
        setResolvedTheme(sys);
        document.documentElement.setAttribute("data-theme", sys);
        document.documentElement.classList.toggle("dark", sys === "dark");
        document.documentElement.classList.toggle("light", sys === "light");
      }
    };

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("od-theme", next);
    // Write cookie so subsequent SSR navigations know the theme
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;

    const res = next === "system" ? getSystemTheme() : next;
    setResolvedTheme(res);
    document.documentElement.setAttribute("data-theme", res);
    document.documentElement.classList.toggle("dark", res === "dark");
    document.documentElement.classList.toggle("light", res === "light");
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, mounted, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
