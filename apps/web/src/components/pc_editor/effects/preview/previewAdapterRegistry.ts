import { getPcEditorEffectSpec, type PcEditorEffectPreviewAccuracy, type PcEditorEffectPreviewAdapter, type PcEditorEffectRenderStage } from "../compiler";
import type { PcEditorEffectPanelItem } from "../types";
import { resolveEffectPreviewTarget } from "./effectPreviewSemantics";
import type { EffectPreviewTarget } from "./types";

export type EffectPreviewAdapterResolution = {
  accuracy: PcEditorEffectPreviewAccuracy;
  pc: PcEditorEffectPreviewAdapter;
  source: "catalog" | "local-spec" | "derived";
  target: EffectPreviewTarget;
  vr: PcEditorEffectPreviewAdapter;
};

export type EffectPreviewAdapterInput = {
  effectId: string;
  eventName?: string | null;
  previewMode?: PcEditorEffectPanelItem["previewMode"];
  previewTarget?: EffectPreviewTarget;
  renderStage?: PcEditorEffectRenderStage | null;
};

function derivedAdapters(target: EffectPreviewTarget, renderStage?: PcEditorEffectRenderStage | null): EffectPreviewAdapterResolution {
  if (target === "world-layer") {
    return {
      accuracy: "approximate",
      pc: "dom",
      source: "derived",
      target,
      vr: "world-layer"
    };
  }

  if (target === "sphere") {
    return {
      accuracy: "approximate",
      pc: "symbolic",
      source: "derived",
      target,
      vr: "aframe-entity"
    };
  }

  if (target === "viewport-mask") {
    return {
      accuracy: renderStage === "viewport_path" ? "exact" : "approximate",
      pc: "dom",
      source: "derived",
      target,
      vr: renderStage === "viewport_path" ? "aframe-entity" : "aframe-shader"
    };
  }

  return {
    accuracy: "symbolic",
    pc: "dom",
    source: "derived",
    target,
    vr: "symbolic"
  };
}

export function resolveEffectPreviewAdapters(input: EffectPreviewAdapterInput): EffectPreviewAdapterResolution {
  const target = resolveEffectPreviewTarget({
    effectId: input.effectId,
    eventName: input.eventName,
    previewMode: input.previewMode,
    previewTarget: input.previewTarget
  });
  const spec = getPcEditorEffectSpec(input.effectId);

  if (spec) {
    return {
      accuracy: spec.preview.accuracy,
      pc: spec.preview.pc,
      source: "local-spec",
      target: input.previewTarget ?? spec.preview.target,
      vr: spec.preview.vr
    };
  }

  return derivedAdapters(target, input.renderStage);
}
