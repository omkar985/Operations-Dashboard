"use client";

import React, { useEffect, useRef } from "react";
import Lenis from "lenis";

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Respect reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      infinite: false,
      autoToggle: true,
      prevent: (node) => {
        if (!node || !(node instanceof HTMLElement)) return false;
        // 1. Explicit data-lenis-prevent attribute or any ancestor with it
        if (node.hasAttribute("data-lenis-prevent") || Boolean(node.closest("[data-lenis-prevent]"))) {
          return true;
        }
        // 2. Modals, dialogs, drawers, popovers
        if (
          Boolean(node.closest('[role="dialog"]')) ||
          Boolean(node.closest('[aria-modal="true"]')) ||
          Boolean(node.closest(".modal-backdrop")) ||
          Boolean(node.closest(".drawer-backdrop"))
        ) {
          return true;
        }
        // 3. Scrollable table containers and segmented bars
        if (Boolean(node.closest(".table-wrap")) || Boolean(node.closest(".segmented"))) {
          return true;
        }
        return false;
      },
    });

    lenisRef.current = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return <>{children}</>;
}
