"use client";

import { useEffect, useRef, useState } from "react";
import type { EffectEventName } from "@/lib/path-protocol";

export const WEBXR_PC_EFFECT_PREVIEW_EVENT = "webxr:pc-effect-preview";

export type PcEffectPreviewDetail = {
  categoryId: string;
  effectId: string;
  eventName: EffectEventName;
  label: string;
};

export function PcEffectPreview() {
  const [effect, setEffect] = useState<PcEffectPreviewDetail | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<PcEffectPreviewDetail>).detail;
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

    window.addEventListener(WEBXR_PC_EFFECT_PREVIEW_EVENT, handlePreview);
    return () => {
      window.removeEventListener(WEBXR_PC_EFFECT_PREVIEW_EVENT, handlePreview);
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
      className="xr-pc-effect-preview"
      data-category={effect.categoryId}
      data-effect={effect.effectId}
      data-testid="xr-pc-effect-preview"
    >
      <div className="xr-pc-effect-preview-pulse" />
      <div className="xr-pc-effect-preview-label">{effect.label}</div>
    </div>
  );
}
