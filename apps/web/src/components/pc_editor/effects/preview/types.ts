import type { EffectEventName } from "@/lib/path-protocol";

export type EffectPreviewTarget = "screen" | "viewport-mask" | "sphere" | "world-layer";

export type EffectPreviewMode = "momentary" | "hold" | "release";

export type PcEffectPreviewDetail = {
  categoryId: string;
  effectId: string;
  eventName: EffectEventName;
  label: string;
  target?: EffectPreviewTarget;
};

export type EffectPreviewState = PcEffectPreviewDetail & {
  mode: EffectPreviewMode;
};
