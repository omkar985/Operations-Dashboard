"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

interface SearchInputProps {
  placeholder?: string;
  className?: string;
  paramKey?: string;
}

export function SearchInput({
  placeholder = "Search by ID, title, assignee...",
  className = "",
  paramKey = "q",
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentParam = searchParams?.get(paramKey) || "";

  const [prevParam, setPrevParam] = useState(currentParam);
  const [value, setValue] = useState(currentParam);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync state if URL changes externally (React adjustment during render)
  if (currentParam !== prevParam) {
    setPrevParam(currentParam);
    setValue(currentParam);
  }

  // Keyboard shortcut '/' to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearch = (term: string) => {
    const next = new URLSearchParams(searchParams?.toString() || "");
    if (term.trim()) {
      next.set(paramKey, term.trim());
    } else {
      next.delete(paramKey);
    }
    next.delete("page"); // Reset page on new search
    router.push(`${pathname}?${next.toString()}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(value);
  };

  const handleClear = () => {
    setValue("");
    handleSearch("");
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className={`relative flex items-center group ${className}`}>
      <Search className="w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="input input-with-icon pr-9 text-xs sm:text-sm h-10 w-full bg-[var(--card)]"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] p-1 rounded-md transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  );
}
