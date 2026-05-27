import type { EffectEventName } from "@/lib/path-protocol";
import type { PcEditorEffectPanelItem } from "../types";
import type { EffectPreviewTarget } from "./types";

export type EffectPreviewDescriptor = {
  effectId: string;
  eventName?: string | null;
  previewMode?: PcEditorEffectPanelItem["previewMode"];
  previewTarget?: EffectPreviewTarget;
};

const VIEWPORT_MASK_EFFECT_IDS = new Set([
  "black-fade",
  "drift-left-parallax",
  "flash-cut",
  "hero-push",
  "impact-shake",
  "look-around",
  "reveal-pull",
  "soft-blur",
  "vhs-blank",
  "white-fade"
]);

const VIEWPORT_MASK_EVENT_NAMES = new Set([
  "black.solid",
  "filter.blur",
  "filter.chromatic_aberration",
  "filter.color_grade",
  "filter.vignette",
  "frame.drift_left_parallax",
  "frame.hero_push",
  "frame.impact_shake",
  "frame.look_around",
  "frame.reveal_pull",
  "overlay.letterbox",
  "overlay.text",
  "transition.fade_black",
  "transition.flash_white"
]);

const BLACK_OCCLUSION_EFFECT_IDS = new Set(["black-fade", "vhs-blank"]);
const BLACK_OCCLUSION_EVENT_NAMES = new Set(["black.solid", "transition.fade_black"]);
const WHITE_OCCLUSION_EFFECT_IDS = new Set(["flash-cut", "white-fade"]);
const WHITE_OCCLUSION_EVENT_NAMES = new Set(["transition.flash_white"]);

const EFFECT_ID_EVENT_NAMES: Record<string, EffectEventName> = {
  "black-fade": "transition.fade_black" as EffectEventName,
  "cold-chrome": "filter.color_grade" as EffectEventName,
  "crystal-ball": "frame.crystal_ball_pull" as EffectEventName,
  "cyan-boost": "filter.color_grade" as EffectEventName,
  "drift-left-parallax": "frame.drift_left_parallax" as EffectEventName,
  "dolly-zoom": "frame.dolly_zoom" as EffectEventName,
  "edge-vignette": "filter.vignette" as EffectEventName,
  "flash-cut": "transition.flash_white" as EffectEventName,
  "focus-box": "highlight" as EffectEventName,
  "grid-dissolve": "filter.blur" as EffectEventName,
  "hero-push": "frame.hero_push" as EffectEventName,
  "hero-shot": "highlight" as EffectEventName,
  "impact-shake": "frame.impact_shake" as EffectEventName,
  "letterbox-bars": "overlay.letterbox" as EffectEventName,
  "little-planet": "frame.little_planet_pullback" as EffectEventName,
  "look-around": "frame.look_around" as EffectEventName,
  "magenta-wash": "filter.color_grade" as EffectEventName,
  "neon-wipe": "highlight" as EffectEventName,
  "reveal-pull": "frame.reveal_pull" as EffectEventName,
  "rgb-split": "filter.chromatic_aberration" as EffectEventName,
  "soft-blur": "filter.blur" as EffectEventName,
  "sunset-grade": "filter.color_grade" as EffectEventName,
  "text-title": "overlay.text" as EffectEventName,
  "vhs-blank": "black.solid" as EffectEventName,
  "warm-vhs": "filter.color_grade" as EffectEventName,
  "white-fade": "transition.flash_white" as EffectEventName
};

export type EffectOcclusionPreviewTone = "black" | "white";
export type EffectViewportMaskPreviewTone =
  | EffectOcclusionPreviewTone
  | "cyan"
  | "magenta"
  | "mono"
  | "orange"
  | "shadow"
  | "steel";

export function resolveEffectEventName(effectId: string, eventName?: string | null): EffectEventName {
  if (eventName && eventName !== effectId) {
    return eventName as EffectEventName;
  }

  return EFFECT_ID_EVENT_NAMES[effectId] ?? (eventName ?? effectId) as EffectEventName;
}

export function isEffectPreviewTarget(value: string | null | undefined): value is EffectPreviewTarget {
  return value === "screen" || value === "viewport-mask" || value === "sphere" || value === "world-layer";
}

export function resolveEffectPreviewTarget(descriptor: EffectPreviewDescriptor): EffectPreviewTarget {
  if (descriptor.previewTarget) {
    return descriptor.previewTarget;
  }

  if (
    VIEWPORT_MASK_EFFECT_IDS.has(descriptor.effectId) ||
    (descriptor.eventName ? VIEWPORT_MASK_EVENT_NAMES.has(descriptor.eventName) : false)
  ) {
    return "viewport-mask";
  }

  if (descriptor.previewMode === "sphere_overlay") {
    return "sphere";
  }

  if (descriptor.previewMode === "ui_overlay") {
    return "screen";
  }

  return "viewport-mask";
}

export function isBlackOcclusionPreview(descriptor: EffectPreviewDescriptor) {
  return (
    BLACK_OCCLUSION_EFFECT_IDS.has(descriptor.effectId) ||
    (descriptor.eventName ? BLACK_OCCLUSION_EVENT_NAMES.has(descriptor.eventName) : false)
  );
}

export function isWhiteOcclusionPreview(descriptor: EffectPreviewDescriptor) {
  return (
    WHITE_OCCLUSION_EFFECT_IDS.has(descriptor.effectId) ||
    (descriptor.eventName ? WHITE_OCCLUSION_EVENT_NAMES.has(descriptor.eventName) : false)
  );
}

export function resolveOcclusionPreviewTone(descriptor: EffectPreviewDescriptor): EffectOcclusionPreviewTone | null {
  if (isBlackOcclusionPreview(descriptor)) {
    return "black";
  }

  if (isWhiteOcclusionPreview(descriptor)) {
    return "white";
  }

  return null;
}

export function resolveViewportMaskPreviewTone(descriptor: EffectPreviewDescriptor): EffectViewportMaskPreviewTone | null {
  if (descriptor.previewTarget && descriptor.previewTarget !== "viewport-mask") {
    return null;
  }

  const occlusionTone = resolveOcclusionPreviewTone(descriptor);
  if (occlusionTone) {
    return occlusionTone;
  }

  if (descriptor.eventName === "highlight") {
    return descriptor.effectId === "hero-shot" ? "orange" : "cyan";
  }

  if (descriptor.eventName === "filter.blur") {
    return "steel";
  }

  if (descriptor.eventName === "filter.vignette") {
    return "shadow";
  }

  if (descriptor.eventName === "filter.chromatic_aberration") {
    return "magenta";
  }

  if (descriptor.eventName === "filter.color_grade") {
    if (descriptor.effectId === "magenta-wash") {
      return "magenta";
    }

    if (descriptor.effectId === "sunset-grade" || descriptor.effectId === "warm-vhs") {
      return "orange";
    }

    if (descriptor.effectId === "cold-chrome") {
      return "steel";
    }

    return "cyan";
  }

  if (descriptor.eventName === "overlay.letterbox") {
    return "shadow";
  }

  if (descriptor.eventName === "overlay.text") {
    return "cyan";
  }

  return null;
}
