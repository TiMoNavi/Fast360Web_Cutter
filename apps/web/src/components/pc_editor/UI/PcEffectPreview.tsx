"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createViewportMaskPreviewStyle,
  isEffectPreviewTarget,
  resolveEffectEventName,
  resolveEffectPreviewTarget,
  type EffectPreviewState
} from "../effects";
import { WEBXR_PC_EFFECT_PREVIEW_EVENT } from "../effects/preview/domPreviewEvents";
import type { PcEffectPreviewDetail } from "../effects/preview/types";
import { useOptionalPcEditorEventBus } from "../events";
import { usePcEditorEffectInput, usePcEditorMaskViewportBounds, type PcEditorEffectInputRuntimeState } from "../state";

function readStringPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function detailFromPayload(payload: unknown): PcEffectPreviewDetail | null {
  const effectId = readStringPayload(payload, "effectId");

  if (!effectId) {
    return null;
  }

  const eventName = resolveEffectEventName(effectId, readStringPayload(payload, "eventName"));
  const payloadTarget = readStringPayload(payload, "previewTarget") ?? readStringPayload(payload, "target");

  return {
    categoryId: readStringPayload(payload, "categoryId") ?? "uncategorized",
    effectId,
    eventName,
    label: readStringPayload(payload, "label") ?? effectId,
    target: resolveEffectPreviewTarget({
      effectId,
      eventName,
      previewTarget: isEffectPreviewTarget(payloadTarget) ? payloadTarget : undefined
    })
  };
}

function effectFromRuntimeInput(effectInput: PcEditorEffectInputRuntimeState | null): EffectPreviewState | null {
  if (!effectInput?.effectId || (effectInput.mode !== "holding" && effectInput.mode !== "selected")) {
    return null;
  }

  const eventName = resolveEffectEventName(effectInput.effectId, effectInput.eventName);

  return {
    categoryId: effectInput.categoryId ?? "uncategorized",
    effectId: effectInput.effectId,
    eventName,
    label: effectInput.label ?? effectInput.effectId,
    mode: effectInput.mode === "holding" ? "hold" : "momentary",
    target: resolveEffectPreviewTarget({
      effectId: effectInput.effectId,
      eventName,
      previewTarget: effectInput.previewTarget
    })
  };
}

export function PcEffectPreview({
  legacyDomEvents = false,
  visualLayer = "full"
}: {
  legacyDomEvents?: boolean;
  visualLayer?: "full" | "label-only";
}) {
  const [effect, setEffect] = useState<EffectPreviewState | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const eventBus = useOptionalPcEditorEventBus();
  const effectInput = usePcEditorEffectInput();
  const maskViewportBounds = usePcEditorMaskViewportBounds();
  const runtimeEffect = useMemo(() => effectFromRuntimeInput(effectInput), [effectInput]);

  const previewStyle = useMemo(() => createViewportMaskPreviewStyle(maskViewportBounds), [maskViewportBounds]);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const hideAfter = (delayMs: number) => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setEffect(null);
      hideTimerRef.current = null;
    }, delayMs);
  };

  useEffect(() => {
    if (!eventBus) {
      return;
    }

    const unbindStart = eventBus.on("editor.effects.hold.start", (event) => {
      const detail = detailFromPayload(event.payload);

      if (!detail) {
        return;
      }

      clearHideTimer();
      setEffect({ ...detail, mode: "hold" });
    });
    const unbindEnd = eventBus.on("editor.effects.hold.end", (event) => {
      const detail = detailFromPayload(event.payload);

      setEffect((value) => {
        if (!value || (detail?.effectId && value.effectId !== detail.effectId)) {
          return value;
        }

        return { ...value, mode: "release" };
      });
      hideAfter(420);
    });

    return () => {
      unbindStart();
      unbindEnd();
    };
  }, [eventBus]);

  useEffect(() => {
    if (!legacyDomEvents) {
      return () => clearHideTimer();
    }

    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<PcEffectPreviewDetail>).detail;
      if (!detail?.effectId) {
        return;
      }

      clearHideTimer();
      setEffect({ ...detail, mode: "momentary" });
      hideAfter(1100);
    };

    window.addEventListener(WEBXR_PC_EFFECT_PREVIEW_EVENT, handlePreview);
    return () => {
      window.removeEventListener(WEBXR_PC_EFFECT_PREVIEW_EVENT, handlePreview);
      clearHideTimer();
    };
  }, [legacyDomEvents]);

  const activeEffect = effect ?? runtimeEffect;

  if (!activeEffect) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="xr-pc-effect-preview"
      data-category={activeEffect.categoryId}
      data-event={activeEffect.eventName}
      data-effect={activeEffect.effectId}
      data-mode={activeEffect.mode}
      data-target={activeEffect.target ?? "screen"}
      data-testid="xr-pc-effect-preview"
      style={previewStyle}
    >
      {visualLayer === "full" ? (
        <>
          <div className="xr-pc-effect-preview-visual" />
          <div className="xr-pc-effect-preview-pulse" />
        </>
      ) : null}
      <div className="xr-pc-effect-preview-label">{activeEffect.label}</div>
    </div>
  );
}
