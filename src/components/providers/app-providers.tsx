"use client";

import React from "react";
import { ThemeProvider, type Theme } from "./theme-provider";
import { LenisProvider } from "./lenis-provider";
import { ToastProvider } from "./toast-provider";

export function AppProviders({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  return (
    <ThemeProvider defaultTheme={defaultTheme}>
      <LenisProvider>
        <ToastProvider>{children}</ToastProvider>
      </LenisProvider>
    </ThemeProvider>
  );
}
