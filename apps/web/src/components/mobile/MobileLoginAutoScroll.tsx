"use client";

import { useEffect } from "react";

export function MobileLoginAutoScroll() {
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!isMobile || reducedMotion || window.location.hash) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const form = document.getElementById("mobile-auth-form");
      const activeElement = document.activeElement;
      const isTyping =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      if (!form || isTyping || window.scrollY > 24) {
        return;
      }

      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, []);

  return null;
}
