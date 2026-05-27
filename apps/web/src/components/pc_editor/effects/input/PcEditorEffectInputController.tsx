"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePcEditorEventEmitter } from "../../events";
import { setPcEditorEffectCatalogState, setPcEditorEffectInput } from "../../state";
import { resolveEffectPreviewAdapters } from "../preview";
import type { PcEditorEffectPanelCategory, PcEditorEffectPanelItem } from "../types";
import { usePcEditorEffectCatalog } from "../usePcEditorEffectCatalog";
import { useEffectShortcutBindings } from "./useEffectShortcutBindings";

const DEFAULT_HOLD_EFFECT_IDS = new Set(["black-fade", "white-fade"]);

export const VR_SUPPORTED_EFFECT_FALLBACK_CATEGORIES: PcEditorEffectPanelCategory[] = [
  {
    id: "transition",
    key: "1",
    label: "Transition",
    effects: [
      {
        conflictGroup: "frame.occlusion",
        durationMs: 900,
        eventName: "transition.fade_black",
        id: "black-fade",
        key: "1",
        label: "Black fade",
        params: { peakOpacity: 1 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "post_remap_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      },
      {
        conflictGroup: "frame.occlusion",
        durationMs: 720,
        eventName: "transition.flash_white",
        id: "white-fade",
        key: "2",
        label: "White fade",
        params: { color: "#ffffff", peakOpacity: 0.92 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "post_remap_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      },
      {
        conflictGroup: "frame.occlusion",
        durationMs: 700,
        eventName: "black.solid",
        id: "vhs-blank",
        key: "3",
        label: "VHS blank",
        params: { peakOpacity: 1 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "post_remap_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      }
    ]
  },
  {
    id: "color",
    key: "2",
    label: "Color",
    effects: [
      {
        durationMs: 760,
        eventName: "filter.blur",
        id: "soft-blur",
        key: "1",
        label: "Soft blur",
        params: { edgeMs: 180, radius: 21, strength: 0.48 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "post_remap_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      }
    ]
  },
  {
    id: "frame",
    key: "3",
    label: "Frame",
    effects: [
      {
        durationMs: 900,
        eventName: "frame.hero_push",
        id: "hero-push",
        key: "1",
        label: "Hero push",
        params: { curve: "easeOutBackSoft", deltaFovH: -10, peakAtRatio: 0.72, reboundFovH: 1 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "viewport_path",
        renderSupported: true,
        webxrSupport: "exact"
      },
      {
        durationMs: 1400,
        eventName: "frame.reveal_pull",
        id: "reveal-pull",
        key: "2",
        label: "Reveal pull",
        params: { curve: "easeInOutCubic", deltaFovH: 14, deltaPitch: 2 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "viewport_path",
        renderSupported: true,
        webxrSupport: "exact"
      },
      {
        durationMs: 1600,
        eventName: "frame.drift_left_parallax",
        id: "drift-left-parallax",
        key: "3",
        label: "Drift left",
        params: { curve: "easeInOutSine", deltaFovH: -3, deltaYaw: -8 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "viewport_path",
        renderSupported: true,
        webxrSupport: "exact"
      },
      {
        durationMs: 620,
        eventName: "frame.impact_shake",
        id: "impact-shake",
        key: "4",
        label: "Impact shake",
        params: { amplitudePitch: 1.4, amplitudeYaw: 2.6, decay: 0.62, shakes: 4 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "viewport_path",
        renderSupported: true,
        webxrSupport: "exact"
      },
      {
        durationMs: 1600,
        eventName: "frame.little_planet_pullback",
        id: "little-planet",
        key: "5",
        label: "Little planet",
        params: { peakAtMs: 560, peakPitch: -88, peakSphereFov: 175, previewFlightHeight: 46.8, previewFov: 138, previewPitch: -90 },
        previewMode: "sphere_overlay",
        previewTarget: "sphere",
        renderFallback: "warn",
        renderStage: "pre_remap_equirect",
        renderSupported: true,
        webxrSupport: "approximate"
      }
    ]
  },
  {
    id: "glitch",
    key: "4",
    label: "Glitch",
    effects: [
      {
        durationMs: 520,
        eventName: "filter.chromatic_aberration",
        id: "rgb-split",
        key: "1",
        label: "RGB split",
        params: { edgeMs: 110, offsetPx: 14, strength: 0.88 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "post_remap_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      }
    ]
  },
  {
    id: "overlay",
    key: "5",
    label: "Overlay",
    effects: [
      {
        conflictGroup: "frame.matte",
        durationMs: 1800,
        eventName: "overlay.letterbox",
        id: "letterbox-bars",
        key: "1",
        label: "Letterbox",
        params: { opacity: 1, ratio: 0.12 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "overlay_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      },
      {
        durationMs: 2400,
        eventName: "overlay.text",
        id: "text-title",
        key: "2",
        label: "Text title",
        params: { backgroundOpacity: 0.45, position: "bottom_center", text: "TEXT" },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "overlay_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      },
      {
        durationMs: 1800,
        eventName: "overlay.portal_ring",
        id: "portal-ring",
        key: "3",
        label: "Portal ring",
        params: { color: "#00d8ff", coreColor: "#05061f", opacity: 0.92, radius: 0.31, secondaryColor: "#ff4dff", thickness: 0.035 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "overlay_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      },
      {
        durationMs: 2200,
        eventName: "overlay.time_vortex",
        id: "time-vortex",
        key: "4",
        label: "Time vortex",
        params: { color: "#4be3ff", coreColor: "#02030d", opacity: 0.86, radius: 0.36, secondaryColor: "#9a4dff" },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "overlay_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      },
      {
        durationMs: 900,
        eventName: "overlay.explosion_sticker",
        id: "explosion-sticker",
        key: "5",
        label: "Explosion sticker",
        params: { color: "#fff0a0", emberColor: "#ff1f00", opacity: 0.95, radius: 0.34, secondaryColor: "#ff6a00", smokeColor: "#282018" },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "overlay_frame",
        renderSupported: true,
        webxrSupport: "approximate"
      }
    ]
  }
];

function effectHoldDurationMs(effect: PcEditorEffectPanelItem, elapsedMs: number) {
  if (effect.id === "white-fade") {
    return Math.min(1800, Math.max(260, Math.round(elapsedMs)));
  }

  return Math.max(160, Math.round(elapsedMs));
}

export function isVrSupportedPanelEffect(effect: PcEditorEffectPanelItem) {
  return effect.renderSupported !== false && effect.webxrSupport !== "unsupported";
}

export function filterVrSupportedEffectCategories(categories: PcEditorEffectPanelCategory[]) {
  return categories
    .map((category) => ({
      ...category,
      effects: category.effects.filter(isVrSupportedPanelEffect)
    }))
    .filter((category) => category.effects.length > 0);
}

function previewTargetForEffect(effect: PcEditorEffectPanelItem) {
  return resolveEffectPreviewAdapters({
    effectId: effect.id,
    eventName: effect.eventName,
    previewMode: effect.previewMode,
    previewTarget: effect.previewTarget,
    renderStage: effect.renderStage
  }).target;
}

function effectPayload(category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem, durationMs?: number) {
  return {
    categoryId: category.id,
    conflictGroup: effect.conflictGroup,
    durationMs: durationMs ?? effect.durationMs,
    effectId: effect.id,
    eventName: effect.eventName,
    label: effect.label,
    params: effect.params,
    previewMode: effect.previewMode,
    previewTarget: previewTargetForEffect(effect),
    renderFallback: effect.renderFallback,
    renderStage: effect.renderStage,
    renderSupported: effect.renderSupported
  };
}

export function PcEditorEffectInputController({
  enabled = true
}: {
  enabled?: boolean;
}) {
  const emit = usePcEditorEventEmitter();
  const catalog = usePcEditorEffectCatalog(VR_SUPPORTED_EFFECT_FALLBACK_CATEGORIES);
  const holdEffectRef = useRef<{
    category: PcEditorEffectPanelCategory;
    effect: PcEditorEffectPanelItem;
    key: string;
    startedAtMs: number;
  } | null>(null);
  const categories = useMemo(() => filterVrSupportedEffectCategories(catalog.categories), [catalog.categories]);

  useEffect(() => {
    setPcEditorEffectCatalogState({
      categories,
      error: catalog.error,
      status: catalog.status
    });
  }, [catalog.error, catalog.status, categories]);

  const emitSelectEffect = (category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem) => {
    emit({
      type: "editor.effects.select",
      payload: effectPayload(category, effect),
      source: {
        device: "pc",
        id: "pc-effects-input-controller",
        kind: "keyboard"
      }
    });
  };

  const beginHoldEffect = (category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem, key: string) => {
    if (holdEffectRef.current) {
      return;
    }

    holdEffectRef.current = {
      category,
      effect,
      key,
      startedAtMs: performance.now()
    };
    emit({
      type: "editor.effects.hold.start",
      payload: effectPayload(category, effect),
      source: {
        device: "pc",
        id: "pc-effects-input-controller",
        kind: "keyboard"
      }
    });
  };

  const endHoldEffect = () => {
    const active = holdEffectRef.current;

    if (!active) {
      return;
    }

    holdEffectRef.current = null;
    emit({
      type: "editor.effects.hold.end",
      payload: effectPayload(active.category, active.effect, effectHoldDurationMs(active.effect, performance.now() - active.startedAtMs)),
      source: {
        device: "pc",
        id: "pc-effects-input-controller",
        kind: "keyboard"
      }
    });
  };

  const shortcutControls = useEffectShortcutBindings({
    categories,
    enabled,
    isHoldEffect: (effect) => DEFAULT_HOLD_EFFECT_IDS.has(effect.id),
    onHoldEnd: endHoldEffect,
    onHoldStart: beginHoldEffect,
    onOpenCategory: () => undefined,
    onSelectEffect: emitSelectEffect
  });
  const { shortcut } = shortcutControls;

  useEffect(() => {
    if (!enabled || shortcut.mode === "hidden") {
      setPcEditorEffectInput({ mode: "hidden" });
      return;
    }

    if (shortcut.mode === "category") {
      setPcEditorEffectInput({ mode: "category" });
      return;
    }

    if (shortcut.mode === "effect") {
      setPcEditorEffectInput({
        categoryId: shortcut.category.id,
        mode: "effect"
      });
      return;
    }

    const nextInput = {
      categoryId: shortcut.category.id,
      effectId: shortcut.effect.id,
      eventName: shortcut.effect.eventName ?? shortcut.effect.id,
      label: shortcut.effect.label,
      mode: shortcut.mode,
      previewTarget: previewTargetForEffect(shortcut.effect)
    } as const;

    if (shortcut.mode === "holding") {
      const activeHold = holdEffectRef.current;

      setPcEditorEffectInput({
        ...nextInput,
        ...(activeHold ? { holdKey: activeHold.key, startedAtMs: activeHold.startedAtMs } : {})
      });
      return;
    }

    setPcEditorEffectInput(nextInput);
  }, [enabled, shortcut]);

  return null;
}
