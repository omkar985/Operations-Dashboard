"use client";

import React from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon, Laptop } from "lucide-react";

export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Color theme switcher"
      className={`segmented inline-flex p-0.5 bg-[var(--raised)] border border-[var(--line-subtle)] rounded-[var(--radius-md)] ${className}`}
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        aria-label="Light mode"
        title="Light mode (Command Centre Day)"
        className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
          theme === "light"
            ? "bg-[var(--card)] text-[var(--primary-ink)] shadow-xs"
            : "text-[var(--muted)] hover:text-[var(--ink)]"
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Day</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        aria-label="Dark mode"
        title="Dark mode (Command Centre Night)"
        className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
          theme === "dark"
            ? "bg-[var(--card)] text-[var(--primary-ink)] shadow-xs"
            : "text-[var(--muted)] hover:text-[var(--ink)]"
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Night</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        aria-pressed={theme === "system"}
        aria-label="Follow system theme"
        title="Follow system theme"
        className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
          theme === "system"
            ? "bg-[var(--card)] text-[var(--primary-ink)] shadow-xs"
            : "text-[var(--muted)] hover:text-[var(--ink)]"
        }`}
      >
        <Laptop className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Auto</span>
      </button>
    </div>
  );
}
