"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { THEME_COOKIE } from "@/lib/auth/constants";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  const attr = document.documentElement.getAttribute("data-theme") as Theme | null;
  return (localStorage.getItem("od-theme") as Theme | null) || attr || defaultTheme;
}

function resolveThemeValue(t: Theme): ResolvedTheme {
  return t === "system" ? "dark" : t;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme(defaultTheme));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemeValue(getInitialTheme(defaultTheme))
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        const sys = e.matches ? "dark" : "light";
        setResolvedTheme(sys);
        document.documentElement.setAttribute("data-theme", sys);
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
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
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
