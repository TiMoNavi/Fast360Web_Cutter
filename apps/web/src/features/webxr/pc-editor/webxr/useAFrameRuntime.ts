"use client";

import { useEffect, useState } from "react";

const AFRAME_SCRIPT_ID = "aframe-runtime-script";
const AFRAME_SCRIPT_SRC = "/api/vendor/aframe";

declare global {
  interface Window {
    AFRAME?: unknown;
  }
}

export function useAFrameRuntime() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (window.AFRAME) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.getElementById(AFRAME_SCRIPT_ID) as HTMLScriptElement | null;

    function markReady() {
      if (!cancelled) {
        setReady(true);
      }
    }

    function markFailed() {
      if (!cancelled) {
        setError("Failed to load A-Frame runtime script.");
      }
    }

    if (existingScript) {
      existingScript.addEventListener("load", markReady, { once: true });
      existingScript.addEventListener("error", markFailed, { once: true });

      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", markReady);
        existingScript.removeEventListener("error", markFailed);
      };
    }

    const script = document.createElement("script");
    script.id = AFRAME_SCRIPT_ID;
    script.src = AFRAME_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", markReady, { once: true });
    script.addEventListener("error", markFailed, { once: true });
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", markReady);
      script.removeEventListener("error", markFailed);
    };
  }, []);

  return { ready, error };
}
