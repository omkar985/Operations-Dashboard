"use client";

import React from "react";
import { ThemeProvider } from "./theme-provider";
import { LenisProvider } from "./lenis-provider";
import { ToastProvider } from "./toast-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LenisProvider>
        <ToastProvider>{children}</ToastProvider>
      </LenisProvider>
    </ThemeProvider>
  );
}
