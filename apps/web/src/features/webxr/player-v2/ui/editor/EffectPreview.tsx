"use client";

import { useEffect, useRef, useState } from "react";
import type { EffectEventName } from "@/lib/path-protocol";
import styles from "./EffectPreview.module.css";

export const WEBXR_EFFECT_PREVIEW_EVENT = "webxr:effect-preview";

export type EffectPreviewDetail = {
  categoryId: string;
  effectId: string;
  eventName: EffectEventName;
  label: string;
};

export function EffectPreview() {
  const [effect, setEffect] = useState<EffectPreviewDetail | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<EffectPreviewDetail>).detail;
      if (!detail?.effectId) {
        return;
      }

      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }

      setEffect(detail);
      hideTimerRef.current = window.setTimeout(() => {
        setEffect(null);
        hideTimerRef.current = null;
      }, 1100);
    };

    window.addEventListener(WEBXR_EFFECT_PREVIEW_EVENT, handlePreview);
    return () => {
      window.removeEventListener(WEBXR_EFFECT_PREVIEW_EVENT, handlePreview);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (!effect) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={styles.effectPreview}
      data-category={effect.categoryId}
      data-effect={effect.effectId}
      data-testid="xr-effect-preview"
    >
      <div className={styles.effectPreviewPulse} />
      <div className={styles.effectPreviewLabel}>{effect.label}</div>
    </div>
  );
}
